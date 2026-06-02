import type { CLIContext } from "@pomelo/types";
import { PomeloLogger } from "@pomelo/shared";
import { executeDevCommand } from "./commands/dev.js";
import { executeBuildCommand } from "./commands/build.js";

export function handleCLI(context: CLIContext): boolean {
  PomeloLogger.info(`Executing CLI command: ${context.command}`);
  if (context.command === "dev") {
    return executeDevCommand(context.args);
  } else if (context.command === "build") {
    return executeBuildCommand(context.args);
  } else {
    PomeloLogger.warn(`Unknown command: ${context.command}`);
    return false;
  }
}

export * from "./commands/dev.js";
export * from "./commands/build.js";
