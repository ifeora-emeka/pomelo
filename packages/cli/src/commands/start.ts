import { PomeloLogger } from "@pomelo/shared";
import { createServer, registerFileSystemRoutes } from "@pomelo/server";
import path from "node:path";

export function executeStartCommand(args: string[]): boolean {
  const isTest = process.env.POMELO_TEST === "true" || process.env.NODE_ENV === "test" || process.env.POMELO_ENV === "test" || args.includes("--test");

  process.env.NODE_ENV = "production";
  process.env.POMELO_ENV = "production";

  PomeloLogger.info(`Starting Pomelo application in production...`);

  const portIndex = args.indexOf("--port");
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1] || "3000") : 3000;

  try {
    const server = createServer({
      name: "Pomelo App",
      version: "1.0.0",
      port,
      env: "production",
    });

    const pagesDir = path.join(process.cwd(), "src/pages");
    registerFileSystemRoutes(server.app, pagesDir);

    if (!isTest) {
      server.start();
    }
    return true;
  } catch (err) {
    PomeloLogger.error("Failed to start server: " + String(err));
    return false;
  }
}
