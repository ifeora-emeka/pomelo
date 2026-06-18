---
title: CLI
description: The kallo CLI — dev, build, start, create, and generate commands.
category: Tooling
order: 1
---

# CLI

The `kallo` CLI powers your app's scripts.

| Command | Description |
| --- | --- |
| `kallo dev` | Start the dev server with HMR and Tailwind watch |
| `kallo build` | Compile routes and Tailwind for production |
| `kallo start` | Run the production server |
| `kallo create <dir>` | Scaffold a new app |
| `kallo generate <type> <name>` | Generate views, components, API routes, and stores |

Your `package.json` wires the common ones:

```json
{
  "scripts": {
    "dev": "kallo dev",
    "build": "kallo build",
    "start": "kallo start"
  }
}
```

### Options

- `kallo dev --port 4000` / `kallo start --port 4000` — change the port (default `3000`).
- `kallo create my-app --template empty` — scaffold the minimal starter.
- `kallo create my-app --pm npm` — choose the package manager for the generated instructions.
