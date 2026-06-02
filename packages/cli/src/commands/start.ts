import { PomeloLogger } from "@pomelo/shared";
import { createServer } from "@pomelo/server";

export function executeStartCommand(args: string[]): boolean {
  PomeloLogger.info(`Starting Pomelo application in production...`);

  const portIndex = args.indexOf("--port");
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1] || "3000") : 3000;

  try {
    const server = createServer({
      name: "Pomelo App",
      version: "1.0.0",
      port,
    });

    if (process.env.NODE_ENV !== "test" && process.env.POMELO_ENV !== "test") {
      server.start();
    }
    return true;
  } catch (err) {
    PomeloLogger.error("Failed to start server: " + String(err));
    return false;
  }
}
