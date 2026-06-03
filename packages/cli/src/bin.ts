#!/usr/bin/env node
import { spawn } from "node:child_process";

const isTypeScriptSource = __filename.endsWith(".ts");

if (isTypeScriptSource && !process.env.POMELO_CLI_RESPAWNED) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", process.argv[1]!, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, POMELO_CLI_RESPAWNED: "true" },
    },
  );
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} else {
  import("./index.js").then(({ handleCLI }) => {
    const command = process.argv[2] || "help";
    const args = process.argv.slice(3);

    const success = handleCLI({ command, args });
    if (!success) {
      process.exit(1);
    }
  });
}
