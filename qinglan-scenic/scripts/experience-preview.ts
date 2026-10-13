// Isolated acceptance environment: production schemas and ports are never reused.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_URL ||=
  process.env.TEST_DATABASE_URL || "postgresql://aiden@127.0.0.1/scenic_test";
const { testStore } = await import("../tests/helpers/postgres.ts");
const fixture = await testStore();
const uploads = await mkdtemp(join(tmpdir(), "qinglan-acceptance-"));
const children: ReturnType<typeof spawn>[] = [];
function start(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && !stopping) {
      console.error("验收进程退出", code);
      void stop();
    }
  });
}
const origin = [6173, 6175, 6176, 6177, 6178, 6179]
  .flatMap((p) => ["http://localhost:" + p, "http://127.0.0.1:" + p])
  .join(",");
start(process.execPath, ["--watch", "src/index.ts"], "apps/server", {
  DATABASE_URL: fixture.url,
  PORT: "9787",
  UPLOAD_DIR: uploads,
  ALLOWED_ORIGINS: origin,
  DEEPSEEK_API_KEY: "",
});
for (const [app, port] of [
  ["visitor", "6173"],
  ["ops", "6175"],
  ["demo", "6178"],
  ["admin", "6179"],
  ["gate", "6177"],
] as const)
  start(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", port],
    "apps/" + app,
    { SCENIC_API_TARGET: "http://127.0.0.1:9787" },
  );
start(
  "pnpm",
  ["exec", "uni", "-p", "h5", "--host", "127.0.0.1", "--port", "6176"],
  "apps/mobile",
  { MOBILE_API_TARGET: "http://127.0.0.1:9787" },
);
console.log(
  "独立验收：游客大屏 :6173，园方大屏 :6175，手机游客 :6176，员工 :6177，演示 :6178，管理 :6179，后端 :9787。退出时清理临时 schema。",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }
          child.once("exit", () => resolve());
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGTERM");
            } catch {
              resolve();
            }
          }
        }),
    ),
  );
  await fixture.close();
  await rm(uploads, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
