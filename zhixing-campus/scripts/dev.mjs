import { spawn } from "node:child_process";
const names = ["public", "ops", "staff", "admin", "mobile"];
const children = names.map((n) =>
  spawn("pnpm", ["--filter", "@scene/" + n, "dev"], { stdio: "inherit" }),
);
children.push(spawn(process.execPath, ["scripts/booking-service.mjs"], { stdio: "inherit" }));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((c) => c.kill(signal));
  });
children.forEach((c) =>
  c.on("exit", (code) => {
    if (code) {
      children.forEach((other) => other.kill());
      process.exitCode = code;
    }
  }),
);
