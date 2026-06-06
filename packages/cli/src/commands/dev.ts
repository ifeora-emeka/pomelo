import { KalloLogger } from "@kallo/shared";
import {
  createServer,
  registerFileSystemRoutes,
  registerAPIRoutes,
} from "@kallo/server";
import fs from "node:fs";
import path from "node:path";

export function executeDevCommand(args: string[]): boolean {
  const isTest =
    process.env.KALLO_TEST === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.KALLO_ENV === "test" ||
    args.includes("--test");

  process.env.NODE_ENV = "development";
  process.env.KALLO_ENV = "development";

  KalloLogger.info(`Starting Kallo development server...`);

  const globalCssPath = path.join(process.cwd(), "src/styles/global.css");
  const outputCssPath = path.join(process.cwd(), "public/tailwind.css");
  if (fs.existsSync(globalCssPath)) {
    KalloLogger.info("Detected global.css, compiling initial Tailwind CSS...");
    const { execSync, spawn } = require("node:child_process");
    try {
      execSync(`npx @tailwindcss/cli -i ${globalCssPath} -o ${outputCssPath}`, {
        stdio: "ignore",
      });
      KalloLogger.info("Initial Tailwind CSS compilation successful.");
    } catch (err) {
      KalloLogger.warn("Failed to compile initial Tailwind CSS: " + String(err));
    }

    KalloLogger.info("Starting Tailwind CSS watcher...");
    const tailwindProc = spawn(
      "npx",
      ["@tailwindcss/cli", "-i", globalCssPath, "-o", outputCssPath, "--watch"],
      {
        shell: true,
      }
    );

    tailwindProc.stdout?.on("data", (data: any) => {
      const msg = data.toString().trim();
      if (msg) KalloLogger.info(`[Tailwind] ${msg}`);
    });

    tailwindProc.stderr?.on("data", (data: any) => {
      const msg = data.toString().trim();
      if (msg) KalloLogger.warn(`[Tailwind] ${msg}`);
    });

    const cleanup = () => {
      try {
        tailwindProc.kill();
      } catch {}
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }

  const portIndex = args.indexOf("--port");
  const port =
    portIndex !== -1 ? parseInt(args[portIndex + 1] || "3000") : 3000;

  try {
    const server = createServer({
      name: "Kallo App (Dev)",
      version: "1.0.0",
      port,
      env: "development",
    });

    const pagesDir = path.join(process.cwd(), "src/view");
    const apiDir = path.join(process.cwd(), "src/api");
    registerFileSystemRoutes(server.app, pagesDir);
    registerAPIRoutes(server.app, apiDir);

    if (!isTest) {
      server.start();
    }
    return true;
  } catch (err) {
    KalloLogger.error("Failed to start development server: " + String(err));
    return false;
  }
}
