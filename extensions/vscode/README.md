# Kallo for VS Code

Language support for the [Kallo](https://github.com/kallojs/kallo) framework and its
`.kal` single-file components.

## Features

- **Syntax highlighting** for the four `.kal` blocks — `<Server>`, `<Client>`,
  `<View>`, `<Style scoped>` (plus `<Head>`) — with embedded TypeScript, CSS, and
  HTML grammars, `{{ }}` interpolation, `:`/`@`/`#` directives, Kallo template
  tags (`<Show>`, `<Each>`, `<Suspense>`, …), and `$keyword` framework APIs.
- **Diagnostics** — duplicate/unterminated blocks, missing `<View>`, and full CSS
  validation inside `<Style>` blocks.
- **IntelliSense** — completion for framework `$keyword` APIs (scoped to
  `<Server>`/`<Client>`), template tags and directives in `<View>`, and native CSS
  completion in `<Style>`.
- **Hover** documentation for `$keyword` APIs and CSS.
- **Document outline** of the blocks in a `.kal` file.
- **Snippets** for pages, layouts, components, and the common `$keyword` blocks.

## Requirements

VS Code `1.90.0` or newer.

## Extension settings

| Setting | Default | Description |
| --- | --- | --- |
| `kallo.validate.enable` | `true` | Enable structural diagnostics. |
| `kallo.css.validate` | `true` | Validate `<Style>` block contents. |
| `kallo.trace.server` | `off` | Trace LSP traffic for debugging. |

## Commands

- **Kallo: Restart Language Server**

## Development

```bash
pnpm install          # from the monorepo root
pnpm --filter kallo-vscode dev      # esbuild watch
```

Press `F5` in VS Code to launch the Extension Development Host.

To produce an installable bundle:

```bash
pnpm --filter kallo-vscode build
pnpm --filter kallo-vscode package   # → kallo-vscode.vsix
```

## License

MIT
