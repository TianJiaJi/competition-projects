import { spawn } from "node:child_process";
import { createServer as createNetServer, connect } from "node:net";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const entries = [
  ["public", 5500],
  ["ops", 5501],
  ["mobile", 5502],
  ["staff", 5503],
  ["admin", 5504],
  ["demo", 5506],
];
const outputDir = (name) =>
  path.join(root, "apps", name, name === "mobile" ? "dist/build/h5" : "dist");
const staticMode = process.argv.includes("--static");
const children = [],
  servers = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const server of servers) server.close();
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  }, 2000);
  timer.unref();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
async function available(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    // macOS may permit a loopback bind alongside an existing wildcard listener.
    // Probe active listeners as well as reservability before starting any service.
    await new Promise((resolve, reject) => {
      const socket = connect({ port, host });
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error(`端口 ${port} 已被占用 (${host})`));
      });
      socket.once("error", (error) => {
        socket.destroy();
        if (
          ["ECONNREFUSED", "EAFNOSUPPORT", "ENETUNREACH"].includes(error.code)
        )
          resolve();
        else reject(error);
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error(`无法确认端口 ${port} 是否空闲 (${host})`));
      });
    });
    await new Promise((resolve, reject) => {
      const server = createNetServer();
      server.once("error", (error) =>
        error.code === "EAFNOSUPPORT"
          ? resolve()
          : reject(
              new Error(
                `端口 ${port} 已被占用或不可用 (${host})：${error.message}`,
              ),
            ),
      );
      server.listen({ port, host, exclusive: true }, () =>
        server.close(resolve),
      );
    });
  }
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};
try {
  if (staticMode)
    for (const [name] of entries)
      await stat(path.join(outputDir(name), "index.html")).catch(() => {
        throw new Error(`${name} 缺少静态构建，请先运行 pnpm demo:build`);
      });
  for (const [, port] of entries) await available(port);
  await available(5507);
  const service = spawn(
    process.execPath,
    [path.join(root, "scripts/demo-service.mjs")],
    { cwd: root, stdio: "inherit" },
  );
  children.push(service);
  service.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  service.on("exit", (code) => {
    if (!stopping) {
      console.error("数据服务异常退出，清理其余进程");
      stop(code || 1);
    }
  });
  for (const [name, port] of entries) {
    if (staticMode) {
      const directory = outputDir(name);
      const server = createServer(async (req, res) => {
        try {
          if (!["GET", "HEAD"].includes(req.method)) {
            res.writeHead(405);
            res.end();
            return;
          }
          const pathname = decodeURIComponent(
            new URL(req.url, "http://localhost").pathname,
          );
          let file = path.resolve(directory, "." + pathname);
          if (!file.startsWith(directory + path.sep) && file !== directory) {
            res.writeHead(403);
            res.end();
            return;
          }
          if (pathname.endsWith("/")) file = path.join(file, "index.html");
          const data = await readFile(file);
          res.writeHead(200, {
            "Content-Type":
              mime[path.extname(file)] ?? "application/octet-stream",
            "Cache-Control": "no-store",
          });
          res.end(req.method === "HEAD" ? undefined : data);
        } catch {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("本地文件不存在");
        }
      });
      server.on("error", (error) => {
        console.error(`[${name}:${port}] ${error.message}`);
        stop(1);
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "localhost", resolve);
      });
      servers.push(server);
      console.log(`[${name}] http://localhost:${port}/ · 本机静态版`);
    } else {
      const child = spawn(
        process.execPath,
        [
          name === "mobile"
            ? path.join(
                root,
                "apps/mobile/node_modules/@dcloudio/vite-plugin-uni/bin/uni.js",
              )
            : path.join(root, "node_modules/vite/bin/vite.js"),
          "--host",
          "localhost",
          "--port",
          String(port),
          "--strictPort",
        ],
        { cwd: path.join(root, "apps", name), stdio: "inherit" },
      );
      children.push(child);
      child.on("error", (error) => {
        console.error(`[${name}] 启动失败：${error.message}`);
        stop(1);
      });
      child.on("exit", (code, signal) => {
        if (!stopping) {
          console.error(
            `[${name}] 服务意外退出 (${code ?? signal})，清理其余服务。`,
          );
          stop(code || 1);
        }
      });
    }
  }
} catch (error) {
  console.error(`演示启动失败：${error.message}`);
  stop(1);
}
