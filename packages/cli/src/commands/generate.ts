import { KalloLogger } from "@kallojs/shared";
import fs from "node:fs";
import path from "node:path";

export function executeGenerateCommand(args: string[]): boolean {
  const type = args[0];
  const name = args[1];

  if (!type || !name) {
    KalloLogger.warn("Usage: kallo generate <view|component|api|store> <name>");
    return false;
  }

  const projectRoot = process.cwd();

  if (type === "view" || type === "page") {
    const pageDir = path.join(projectRoot, "src/view", name);
    if (!fs.existsSync(pageDir)) {
      fs.mkdirSync(pageDir, { recursive: true });
    }
    const pagePath = path.join(pageDir, "page.kal");
    if (fs.existsSync(pagePath)) {
      KalloLogger.warn(`View src/view/${name}/page.kal already exists!`);
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
    KalloLogger.info(`Generated view: src/view/${name}/page.kal`);
    return true;
  }

  if (type === "component") {
    const compDir = path.join(projectRoot, "src/components");
    if (!fs.existsSync(compDir)) {
      fs.mkdirSync(compDir, { recursive: true });
    }
    const compPath = path.join(compDir, `${name}.kal`);
    if (fs.existsSync(compPath)) {
      KalloLogger.warn(`Component ${name}.kal already exists!`);
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
    KalloLogger.info(`Generated component: src/components/${name}.kal`);
    return true;
  }

  if (type === "api") {
    const apiRouteDir = path.join(projectRoot, "src/api", name);
    const controllerDir = path.join(apiRouteDir, "controllers");
    const serviceDir = path.join(apiRouteDir, "services");

    if (!fs.existsSync(controllerDir)) {
      fs.mkdirSync(controllerDir, { recursive: true });
    }
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }

    const serviceName = name.charAt(0).toUpperCase() + name.slice(1);
    const apiPath = path.join(apiRouteDir, `${name}.api.ts`);
    const controllerPath = path.join(controllerDir, `${name}.controller.ts`);
    const servicePath = path.join(serviceDir, `${name}.service.ts`);

    if (fs.existsSync(apiPath)) {
      KalloLogger.warn(
        `API route src/api/${name}/${name}.api.ts already exists!`,
      );
      return false;
    }

    // 1. Write Service
    fs.writeFileSync(
      servicePath,
      `export class ${serviceName}Service {
  async getHello() {
    return { message: "Hello from ${serviceName} Service!" };
  }
}
`
    );

    // 2. Write Controller
    fs.writeFileSync(
      controllerPath,
      `import { ${serviceName}Service } from "../services/${name}.service.js";

const service = new ${serviceName}Service();

export async function getHello(req: any, res: any) {
  try {
    const data = await service.getHello();
    res.ok(data);
  } catch (err: any) {
    res.serverError(err.message);
  }
}
`
    );

    // 3. Write Routes
    fs.writeFileSync(
      apiPath,
      `import { $router } from "@kallojs/server";
import { getHello } from "./controllers/${name}.controller.js";

const router = $router();

router.get("/", getHello);

export default router;
`
    );

    // 4. Update/Create src/api/index.ts
    const entryPath = path.join(projectRoot, "src/api/index.ts");
    if (!fs.existsSync(entryPath)) {
      fs.writeFileSync(
        entryPath,
        `import { $router } from "@kallojs/server";
import ${name}Routes from "./${name}/${name}.api.js";

const router = $router();

router.use("/${name}", ${name}Routes);

export default router;
`
      );
    } else {
      let content = fs.readFileSync(entryPath, "utf-8");
      const importLine = `import ${name}Routes from "./${name}/${name}.api.js";\n`;
      const routerUseLine = `router.use("/${name}", ${name}Routes);\n`;

      if (!content.includes(importLine) && !content.includes(`./${name}/${name}.api.js`)) {
        const exportIdx = content.indexOf("export default");
        if (exportIdx !== -1) {
          content = importLine + content.slice(0, exportIdx) + routerUseLine + content.slice(exportIdx);
        } else {
          content = importLine + content + "\n" + routerUseLine;
        }
        fs.writeFileSync(entryPath, content);
      }
    }

    KalloLogger.info(`Generated API package: src/api/${name} (routes, controller, service)`);
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
      `import { $store } from "@kallojs/runtime";

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
