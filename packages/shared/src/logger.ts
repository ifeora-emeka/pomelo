import type { FrameworkConfig } from "@pomelo/types";
import { FRAMEWORK_NAME } from "./constants.js";

export class PomeloLogger {
  private static prefix = `\x1b[35m[${FRAMEWORK_NAME}]\x1b[0m`;

  static info(message: string): string {
    const formatted = `${this.prefix} \x1b[32mINFO:\x1b[0m ${message}`;
    console.log(formatted);
    return formatted;
  }

  static warn(message: string): string {
    const formatted = `${this.prefix} \x1b[33mWARN:\x1b[0m ${message}`;
    console.warn(formatted);
    return formatted;
  }

  static error(message: string): string {
    const formatted = `${this.prefix} \x1b[31mERROR:\x1b[0m ${message}`;
    console.error(formatted);
    return formatted;
  }
}

export function formatFrameworkName(config: FrameworkConfig): string {
  return `${config.name} (v${config.version})`;
}
