import { KalloLogger, loadEnv } from "@kallojs/shared";
import {
  createServer,
  registerFileSystemRoutes,
  registerAPIRoutes,
} from "@kallojs/server";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { loadConfig } from "../config.js";
import { lintProjectForStatic, formatIssue } from "../static-lint.js";

/**
 * When the project targets a static export, surface static-incompatible
 * features early (as warnings) so they aren't discovered only at `kallo export`
 * time. Fire-and-forget so it never blocks dev startup.
 */
function warnIfStaticIncompatible(cwd: string): void {
  loadConfig(cwd)
    .then((cfg) => {
      if (cfg.output !== "static") return;
      const { errors, warnings } = lintProjectForStatic(cwd);
      for (const issue of [...errors, ...warnings]) {
        KalloLogger.warn(
          `static-export: this will ${issue.severity === "error" ? "fail" : "degrade"} in \`kallo export\`:\n${formatIssue(issue)}`,
        );
      }
    })
    .catch(() => {
      /* config load issues are reported by loadConfig itself */
    });
}

export function executeDevCommand(args: string[]): boolean {
  const isTest =
    process.env.KALLO_TEST === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.KALLO_ENV === "test" ||
    args.includes("--test");

  process.env.NODE_ENV = "development";
  process.env.KALLO_ENV = "development";

  loadEnv("development");

  KalloLogger.info(`Starting Kallo development server...`);

  warnIfStaticIncompatible(process.cwd());

  const globalCssPath = path.join(process.cwd(), "src/styles/global.css");
  const outputCssPath = path.join(process.cwd(), "public/tailwind.css");
  if (fs.existsSync(globalCssPath)) {
    KalloLogger.info("Detected global.css, compiling initial Tailwind CSS...");
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

    tailwindProc.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) KalloLogger.info(`[Tailwind] ${msg}`);
    });

    tailwindProc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) KalloLogger.warn(`[Tailwind] ${msg}`);
    });

    const cleanup = () => {
      try {
        tailwindProc.kill();
      } catch {
        // Process already exited; nothing to kill.
      }
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
    // NOTE: the built-in auth engine is opt-in via `auth` in kallo.config.ts —
    // it is NOT auto-enabled from the KALLO_AUTH_SECRET env var. That var is
    // also used by the low-level session helpers ($setSessionCookie/
    // $currentUser), so keying the whole engine off it would hijack the
    // /api/auth/* routes of apps that roll their own auth (and diverge from
    // `kallo start`, which never enables it implicitly).
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
