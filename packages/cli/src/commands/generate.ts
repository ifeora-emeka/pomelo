import { PomeloLogger } from "@pomelo/shared";
import fs from "node:fs";
import path from "node:path";

export function executeGenerateCommand(args: string[]): boolean {
  const type = args[0];
  const name = args[1];

  if (!type || !name) {
    PomeloLogger.warn("Usage: pomelo generate <page|component> <name>");
    return false;
  }

  const projectRoot = process.cwd();

  if (type === "page") {
    const pagesDir = path.join(projectRoot, "src/pages");
    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
    }
    const pagePath = path.join(pagesDir, `${name}.pom`);
    if (fs.existsSync(pagePath)) {
      PomeloLogger.warn(`Page ${name}.pom already exists!`);
      return false;
    }
    fs.writeFileSync(
      pagePath,
      `<Server>
  $page(async () => {
    return { title: "${name} Page" };
  });
</Server>

<View>
  <h1>{{ title }}</h1>
</View>
`
    );
    PomeloLogger.info(`Generated page: src/pages/${name}.pom`);
    return true;
  }

  if (type === "component") {
    const compDir = path.join(projectRoot, "src/components");
    if (!fs.existsSync(compDir)) {
      fs.mkdirSync(compDir, { recursive: true });
    }
    const compPath = path.join(compDir, `${name}.pom`);
    if (fs.existsSync(compPath)) {
      PomeloLogger.warn(`Component ${name}.pom already exists!`);
      return false;
    }
    fs.writeFileSync(
      compPath,
      `<Client>
  // Client setup
</Client>

<View>
  <div class="comp-${name.toLowerCase()}">
    <slot />
  </div>
</View>
`
    );
    PomeloLogger.info(`Generated component: src/components/${name}.pom`);
    return true;
  }

  if (type === "api") {
    const pagesDir = path.join(projectRoot, "src/pages");
    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
    }
    const apiDir = path.join(pagesDir, "api");
    if (!fs.existsSync(apiDir)) {
      fs.mkdirSync(apiDir, { recursive: true });
    }
    const apiPath = path.join(apiDir, `${name}.pom`);
    if (fs.existsSync(apiPath)) {
      PomeloLogger.warn(`API route api/${name}.pom already exists!`);
      return false;
    }
    fs.writeFileSync(
      apiPath,
      `<Server>
  $page(async ({ req, res }) => {
    res.ok({
      message: "Hello from ${name} API endpoint!"
    });
  });
</Server>
`
    );
    PomeloLogger.info(`Generated API route: src/pages/api/${name}.pom`);
    return true;
  }

  if (type === "store") {
    const storesDir = path.join(projectRoot, "src/stores");
    if (!fs.existsSync(storesDir)) {
      fs.mkdirSync(storesDir, { recursive: true });
    }
    const storePath = path.join(storesDir, `${name}.ts`);
    if (fs.existsSync(storePath)) {
      PomeloLogger.warn(`Store ${name}.ts already exists!`);
      return false;
    }
    const storePascal = name.charAt(0).toUpperCase() + name.slice(1);
    fs.writeFileSync(
      storePath,
      `import { $store } from "@pomelo/runtime";

export const use${storePascal}Store = $store(
  {
    items: [] as any[],
    // Define reactive states and mutators here
  },
  {
    persist: true,
    persistKey: "pomelo-${name.toLowerCase()}-store",
  }
);
`
    );
    PomeloLogger.info(`Generated store: src/stores/${name}.ts`);
    return true;
  }

  PomeloLogger.warn(`Unknown generator type: ${type}`);
  return false;
}
