import { formatFrameworkName, logInfo } from "@pomelo/shared";
import { compilePomelo } from "@pomelo/compiler";
import { startPomeloServer } from "@pomelo/server";
import { createLocalState } from "@pomelo/runtime";
import { pomeloVitePlugin } from "@pomelo/vite-plugin";
import type { FrameworkConfig } from "@pomelo/types";

export function runCLI(): void {
  logInfo("CLI initialized");

  const config: FrameworkConfig = {
    name: "Pomelo App",
    version: "1.0.0",
    port: 3000
  };

  // Test integration of all packages
  const formatted = formatFrameworkName(config);
  logInfo(`Configured App Name: ${formatted}`);

  const source = "<View><h1>Hello Pomelo!</h1></View>";
  const compiled = compilePomelo(source);
  logInfo(`Compiled output:\n${compiled}`);

  const state = createLocalState(42);
  logInfo(`Local state value: ${state.get()}`);

  const plugin = pomeloVitePlugin();
  logInfo(`Vite plugin initialized: ${plugin.name}`);

  startPomeloServer(config);
}
