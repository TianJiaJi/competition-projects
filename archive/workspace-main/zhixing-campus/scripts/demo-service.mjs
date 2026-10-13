import { fileURLToPath } from "node:url";
import { createService } from "../packages/demo/server/service.mjs";
const directory =
  process.env.DEMO_DATA_DIR ||
  fileURLToPath(new URL("../.local/builder/", import.meta.url));
const port = Number(process.env.DEMO_API_PORT || 5507);
const server = createService(directory);
server.on("error", (error) => {
  console.error(`本机服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "localhost", () =>
  console.log(`[service] http://localhost:${port} · SQLite 本机服务`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
