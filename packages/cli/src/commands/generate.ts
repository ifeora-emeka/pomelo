import { KalloLogger } from "@kallo/shared";
import fs from "node:fs";
import path from "node:path";

export function executeGenerateCommand(args: string[]): boolean {
  const type = args[0];
  const name = args[1];

  if (!type || !name) {
    KalloLogger.warn("Usage: kallo generate <page|component> <name>");
    return false;
  }

  const projectRoot = process.cwd();

  if (type === "page") {
    const pageDir = path.join(projectRoot, "src/pages", name);
    if (!fs.existsSync(pageDir)) {
      fs.mkdirSync(pageDir, { recursive: true });
    }
    const pagePath = path.join(pageDir, "page.pom");
    if (fs.existsSync(pagePath)) {
      KalloLogger.warn(`Page src/pages/${name}/page.pom already exists!`);
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
`,
    );
    KalloLogger.info(`Generated page: src/pages/${name}/page.pom`);
    return true;
  }

  if (type === "component") {
    const compDir = path.join(projectRoot, "src/components");
    if (!fs.existsSync(compDir)) {
      fs.mkdirSync(compDir, { recursive: true });
    }
    const compPath = path.join(compDir, `${name}.pom`);
    if (fs.existsSync(compPath)) {
      KalloLogger.warn(`Component ${name}.pom already exists!`);
      return false;
    }
    fs.writeFileSync(
      compPath,
      `<Client>
  // Client setup
</Client>

<View>
  <div class="comp-${name.toLowerCase()}">
    <Slot />
  </div>
</View>
`,
    );
    KalloLogger.info(`Generated component: src/components/${name}.pom`);
    return true;
  }

  if (type === "api") {
    const apiRouteDir = path.join(projectRoot, "src/api", name);
    if (!fs.existsSync(apiRouteDir)) {
      fs.mkdirSync(apiRouteDir, { recursive: true });
    }
    const apiPath = path.join(apiRouteDir, `${name}.api.ts`);
    if (fs.existsSync(apiPath)) {
      KalloLogger.warn(
        `API route src/api/${name}/${name}.api.ts already exists!`,
      );
      return false;
    }
    fs.writeFileSync(
      apiPath,
      `import { $router } from "@kallo/server";

const router = $router();

router.get("/", (req, res) => {
  res.ok({
    message: "Hello from ${name} API endpoint!"
  });
});

export default router;
`,
    );
    KalloLogger.info(`Generated API route: src/api/${name}/${name}.api.ts`);
    return true;
  }

  if (type === "store") {
    const storesDir = path.join(projectRoot, "src/stores");
    if (!fs.existsSync(storesDir)) {
      fs.mkdirSync(storesDir, { recursive: true });
    }
    const storePath = path.join(storesDir, `${name}.ts`);
    if (fs.existsSync(storePath)) {
      KalloLogger.warn(`Store ${name}.ts already exists!`);
      return false;
    }
    const storePascal = name.charAt(0).toUpperCase() + name.slice(1);
    fs.writeFileSync(
      storePath,
      `import { $store } from "@kallo/runtime";

export const use${storePascal}Store = $store(
  {
    items: [] as any[],
    // Define reactive states and mutators here
  },
  {
    persist: true,
    persistKey: "kallo-${name.toLowerCase()}-store",
  }
);
`,
    );
    KalloLogger.info(`Generated store: src/stores/${name}.ts`);
    return true;
  }

  KalloLogger.warn(`Unknown generator type: ${type}`);
  return false;
}
