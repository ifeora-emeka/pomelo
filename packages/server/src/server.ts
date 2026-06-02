import type { FrameworkConfig } from "@pomelo/types";
import { formatFrameworkName, PomeloLogger } from "@pomelo/shared";

export function createServer(config: FrameworkConfig) {
  const name = formatFrameworkName(config);
  PomeloLogger.info(`Creating server for ${name}...`);

  return {
    start() {
      PomeloLogger.info(
        `Pomelo server running at http://localhost:${config.port}`,
      );
      return true;
    },
  };
}
