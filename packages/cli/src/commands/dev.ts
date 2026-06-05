import { KalloLogger } from "@kallo/shared";
import {
  createServer,
  registerFileSystemRoutes,
  registerAPIRoutes,
} from "@kallo/server";
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
