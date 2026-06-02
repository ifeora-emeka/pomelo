import { PomeloLogger } from "@pomelo/shared";
import fs from "node:fs";
import path from "node:path";

export function executeCreateCommand(args: string[]): boolean {
  const appName = args[0] || "my-pomelo-app";
  const targetDir = path.resolve(process.cwd(), appName);

  PomeloLogger.info(`Scaffolding new Pomelo project in ${targetDir}...`);

  if (fs.existsSync(targetDir)) {
    PomeloLogger.warn(`Directory ${appName} already exists!`);
    return false;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/pages"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/components"), { recursive: true });

    fs.writeFileSync(
      path.join(targetDir, "package.json"),
      JSON.stringify(
        {
          name: appName,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "pomelo dev",
            build: "pomelo build",
            start: "pomelo start",
          },
          dependencies: {
            "@pomelo/runtime": "workspace:*",
            "@pomelo/server": "workspace:*",
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      path.join(targetDir, "src/pages/index.pom"),
      `<Server>
  $page(async () => {
    return { title: "Welcome to Pomelo!" };
  });
</Server>

<Client>
  import { $local } from "@pomelo/runtime";
  const count = $local(0);
</Client>

<View>
  <main class="container">
    <h1>{{ title }}</h1>
    <p>Get started by editing <code>src/pages/index.pom</code></p>
    <button @click="count = count + 1">Clicked {{ count }} times</button>
  </main>
</View>

<Style>
  .container {
    font-family: system-ui, sans-serif;
    padding: 2rem;
    text-align: center;
  }
</Style>
`
    );

    PomeloLogger.info(`Successfully created project ${appName}!`);
    return true;
  } catch (err) {
    PomeloLogger.error("Failed to scaffold project: " + String(err));
    return false;
  }
}
