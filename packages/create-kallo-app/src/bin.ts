#!/usr/bin/env node
import { executeCreateCommand } from "@kallojs/cli";

// `npm create kallo-app@latest my-app` invokes this as `create-kallo-app my-app`.
// Forward all args straight to the CLI's create command.
const args = process.argv.slice(2);

executeCreateCommand(args)
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
