import type { FrameworkConfig } from "@pomelo/types";

export function formatFrameworkName(config: FrameworkConfig): string {
  return `${config.name} (v${config.version})`;
}

export function logInfo(message: string): void {
  console.log(`[Pomelo Shared] ${message}`);
}
