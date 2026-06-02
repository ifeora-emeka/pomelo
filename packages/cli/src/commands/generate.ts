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

  PomeloLogger.warn(`Unknown generator type: ${type}`);
  return false;
}
