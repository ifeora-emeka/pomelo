import type { CLIContext } from "@pomelo/types";
import { PomeloLogger } from "@pomelo/shared";
import { executeDevCommand } from "./commands/dev.js";
import { executeBuildCommand } from "./commands/build.js";
import { executeStartCommand } from "./commands/start.js";
import { executeCreateCommand } from "./commands/create.js";
import { executeGenerateCommand } from "./commands/generate.js";
import { executeHelpCommand } from "./commands/help.js";

export function handleCLI(context: CLIContext): boolean {
  PomeloLogger.info(`Executing CLI command: ${context.command}`);
  if (context.command === "dev") {
    return executeDevCommand(context.args);
  } else if (context.command === "build") {
    return executeBuildCommand(context.args);
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
    console.log("0.1.0");
    return true;
  } else {
    PomeloLogger.warn(`Unknown command: ${context.command}`);
    return false;
  }
}

export * from "./commands/dev.js";
export * from "./commands/build.js";
export * from "./commands/start.js";
export * from "./commands/create.js";
export * from "./commands/generate.js";
export * from "./commands/help.js";
