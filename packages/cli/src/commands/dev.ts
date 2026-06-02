import { PomeloLogger } from "@pomelo/shared";

export function executeDevCommand(args: string[]): boolean {
  PomeloLogger.info(`Starting development mode with args: ${args.join(", ")}`);
  return true;
}
