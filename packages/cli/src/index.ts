import type { CLIContext } from "@kallojs/types";
import { KalloLogger, loadEnv } from "@kallojs/shared";
import { readFileSync } from "node:fs";
import path from "node:path";
import { executeDevCommand } from "./commands/dev.js";
import { executeBuildCommand } from "./commands/build.js";
import { executeExportCommand } from "./commands/export.js";
import { executeStartCommand } from "./commands/start.js";
import { executeCreateCommand } from "./commands/create.js";
import { executeGenerateCommand } from "./commands/generate.js";
import { executeHelpCommand } from "./commands/help.js";

/** Read the CLI's own version from its package.json (single source of truth). */
function getCliVersion(): string {
  try {
    // Compiled output lives in dist/; package.json is one level up.
    const pkg = JSON.parse(
      readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
    );
    return pkg.version as string;
  } catch {
    return "0.0.0";
  }
}

export function handleCLI(context: CLIContext): boolean | Promise<boolean> {
  loadEnv();
  KalloLogger.info(`Executing CLI command: ${context.command}`);
  if (context.command === "dev") {
    return executeDevCommand(context.args);
  } else if (context.command === "build") {
    // `build --static` is an alias for `export`.
    if (context.args.includes("--static")) {
      return executeExportCommand(context.args);
    }
    return executeBuildCommand(context.args);
  } else if (context.command === "export") {
    return executeExportCommand(context.args);
  } else if (context.command === "start") {
    return executeStartCommand(context.args);
  } else if (context.command === "create") {
    return executeCreateCommand(context.args);
  } else if (context.command === "generate" || context.command === "g") {
    return executeGenerateCommand(context.args);
  } else if (
    context.command === "help" ||
    context.command === "--help" ||
    context.command === "-h"
  ) {
    return executeHelpCommand(context.args);
  } else if (
    context.command === "version" ||
    context.command === "--version" ||
    context.command === "-v"
  ) {
    console.log(getCliVersion());
    return true;
  } else {
    KalloLogger.warn(`Unknown command: ${context.command}`);
    return false;
  }
}

export * from "./commands/dev.js";
export * from "./commands/build.js";
export * from "./commands/export.js";
export * from "./commands/start.js";
export * from "./config.js";
export * from "./static-lint.js";
export * from "./commands/create.js";
export * from "./commands/generate.js";
export * from "./commands/help.js";
