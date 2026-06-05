import type { FrameworkConfig } from "@kallo/types";
import {
  FRAMEWORK_NAME,
  COLOR_RESET,
  COLOR_MAGENTA,
  COLOR_GREEN,
  COLOR_YELLOW,
  COLOR_RED,
} from "./constants.js";

export class KalloLogger {
  private static prefix = `${COLOR_MAGENTA}[${FRAMEWORK_NAME}]${COLOR_RESET}`;

  static info(message: string): string {
    const formatted = `${this.prefix} ${COLOR_GREEN}INFO:${COLOR_RESET} ${message}`;
    console.log(formatted);
    return formatted;
  }

  static warn(message: string): string {
    const formatted = `${this.prefix} ${COLOR_YELLOW}WARN:${COLOR_RESET} ${message}`;
    console.warn(formatted);
    return formatted;
  }

  static error(message: string): string {
    const formatted = `${this.prefix} ${COLOR_RED}ERROR:${COLOR_RESET} ${message}`;
    console.error(formatted);
    return formatted;
  }
}

export function formatFrameworkName(config: FrameworkConfig): string {
  return `${config.name} (v${config.version})`;
}
