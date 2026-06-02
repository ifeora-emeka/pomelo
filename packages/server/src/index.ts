import type { FrameworkConfig } from "@pomelo/types";
import { formatFrameworkName, logInfo } from "@pomelo/shared";

export function startPomeloServer(config: FrameworkConfig): void {
  const name = formatFrameworkName(config);
  logInfo(`Starting server for ${name} on port ${config.port}...`);
}
