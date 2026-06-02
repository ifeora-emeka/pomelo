import { PomeloLogger } from "@pomelo/shared";

export function executeBuildCommand(args: string[]): boolean {
  PomeloLogger.info(
    `Starting compilation bundle with args: ${args.join(", ")}`,
  );
  return true;
}
