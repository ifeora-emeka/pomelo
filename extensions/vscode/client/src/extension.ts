import * as path from "node:path";
import {
  workspace,
  commands,
  window,
  type ExtensionContext,
} from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6019"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "kal" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.kal"),
    },
  };

  client = new LanguageClient(
    "kallo",
    "Kallo Language Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(
    commands.registerCommand("kallo.restartServer", async () => {
      if (!client) return;
      await client.restart();
      window.showInformationMessage("Kallo language server restarted.");
    }),
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
