export function executeHelpCommand(args: string[]): boolean {
  const subCommand = args[0];

  if (subCommand === "create") {
    console.log(`
Usage: kallo create <project-name> [options]

Scaffold a new fullstack Kallo ecommerce starter in the target directory.

Arguments:
  <project-name>  Target directory to scaffold into. Use "." for the current
                  directory (e.g. inside an already-cloned repo).

Options:
  --name <text>      Store / brand display name
  --pkg-name <name>  package.json "name" (default: sanitized folder name)
  --accent <color>   Accent color: violet | blue | emerald | rose (default: violet)
  --pm <manager>     Package manager: pnpm | npm | yarn (default: pnpm)
  -f, --force        Scaffold into a non-empty directory (may overwrite files)
  -y, --yes          Skip prompts and accept defaults

Examples:
  kallo create my-shop --accent emerald --pm npm
  git clone <repo> my-shop && cd my-shop && kallo create . --force
`);
    return true;
  }

  if (subCommand === "dev") {
    console.log(`
Usage: kallo dev [options]

Start the Kallo development server with live routing and HMR support.

Options:
  --port <number>  The port to run the server on (default: 3000)

Example:
  kallo dev --port 8080
`);
    return true;
  }

  if (subCommand === "build") {
    console.log(`
Usage: kallo build [options]

Compile all SFC (.kal) views and components to production-ready JS modules.

Options:
  --minify         Minify the compiled JS and CSS outputs

Example:
  kallo build --minify
`);
    return true;
  }

  if (subCommand === "export") {
    console.log(`
Usage: kallo export [options]
Alias: kallo build --static

Pre-render every route to a static site in the output directory (default: out/)
that can be hosted on GitHub Pages or any static host / CDN. Reads output,
basePath, outDir and trailingSlash from kallo.config.ts.

Dynamic routes ([param]) must export $staticParams()/$paths() to enumerate the
concrete params to render (the generateStaticParams equivalent).

Options:
  --test           Do not fail the process on per-route errors (CI dry-run)

Example:
  kallo export
`);
    return true;
  }

  if (subCommand === "start") {
    console.log(`
Usage: kallo start [options]

Start the compiled Kallo application in production mode.

Options:
  --port <number>  The port to run the server on (default: 3000)

Example:
  kallo start --port 3000
`);
    return true;
  }

  if (subCommand === "generate" || subCommand === "g") {
    console.log(`
Usage: kallo generate <type> <name>
Alias: kallo g <type> <name>

Scaffold a new Kallo SFC view or component.

Arguments:
  <type>  Type of generator: "view" or "component" (required)
  <name>  The name of the file to create (required)

Examples:
  kallo generate view about
  kallo g component button
`);
    return true;
  }

  // General help
  console.log(`
Kallo fullstack framework command line interface.

Usage: kallo <command> [options]

Commands:
  create <name>        Scaffold a new Kallo project
  dev                  Start development server
  build                Build application for production
  export               Pre-render a static site to out/ (GitHub Pages, CDN)
  start                Start production server
  generate <type> <n>  Generate view or component (alias: g)
  help [command]       Display help for a command

Options:
  -h, --help           Display help information
  -v, --version        Display framework version

Use "kallo help <command>" for more information about a specific command.
`);
  return true;
}
