export function executeHelpCommand(args: string[]): boolean {
  const subCommand = args[0];

  if (subCommand === "create") {
    console.log(`
Usage: kallo create <project-name>

Scaffold a new fullstack Kallo project in the target directory.

Arguments:
  <project-name>  The directory name to create for the project (required)

Example:
  kallo create my-app
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
