For a framework project, I would strongly recommend a **monorepo-first architecture** where every major responsibility is its own package.

Don't build Kallo as one giant codebase.

Build it like how Next.js, Nuxt, Vue, SvelteKit, and Angular are internally organized.

A good mental model is:

```text
Compiler
Runtime
Server
CLI
Dev Server
Build System
Shared Utils
```

all separated.

---

# Recommended Turborepo Structure

```text
kallo/

├── apps/
│
│   ├── website/
│   │
│   ├── docs/
│   │
│   └── playground/
│
│
├── packages/
│
│   ├── compiler/
│   │
│   ├── vite-plugin/
│   │
│   ├── runtime/
│   │
│   ├── server/
│   │
│   ├── router/
│   │
│   ├── reactivity/
│   │
│   ├── state/
│   │
│   ├── auth/
│   │
│   ├── metadata/
│   │
│   ├── css/
│   │
│   ├── cli/
│   │
│   ├── create-kallo/
│   │
│   ├── shared/
│   │
│   └── types/
│
│
├── examples/
│
│   ├── ecommerce/
│   ├── blog/
│   ├── saas/
│   └── dashboard/
│
│
├── scripts/
│
├── turbo.json
│
├── package.json
│
└── pnpm-workspace.yaml
```

---

# Phase 1 Packages

If you were starting tomorrow, I'd only build these first:

```text
compiler
runtime
server
vite-plugin
cli
shared
types
```

Everything else can come later.

---

# Compiler Package

This is the heart of Kallo.

```text
packages/compiler/

src/

├── parser/
│
│   ├── lexer.ts
│   ├── parser.ts
│   └── ast.ts
│
├── transforms/
│
│   ├── server-transform.ts
│   ├── client-transform.ts
│   ├── style-transform.ts
│   ├── template-transform.ts
│   └── route-transform.ts
│
├── generators/
│
│   ├── server-generator.ts
│   ├── client-generator.ts
│   └── html-generator.ts
│
├── compiler.ts
│
└── index.ts
```

Responsibility:

```text
page.kal

↓

AST

↓

Generated JS
```

Nothing else.

---

# Runtime Package

Contains client-side runtime.

```text
packages/runtime/

src/

├── renderer/
│
├── dom/
│
├── hydration/
│
├── lifecycle/
│
├── events/
│
└── index.ts
```

This becomes:

```ts
import { $local } from "@kallojs/runtime";
```

---

# Reactivity Package

Eventually separate.

```text
packages/reactivity/

src/

├── signal.ts
├── effect.ts
├── computed.ts
├── store.ts
└── index.ts
```

Everything state-related lives here.

---

# Server Package

Express integration.

```text
packages/server/

src/

├── server.ts
│
├── router.ts
│
├── middleware/
│
├── auth/
│
├── rendering/
│
├── api/
│
└── index.ts
```

Usage:

```ts
import { createServer } from "@kallojs/server";
```

---

# Vite Plugin Package

Most important package after compiler.

```text
packages/vite-plugin/

src/

├── transform.ts
├── hmr.ts
├── virtual-modules.ts
├── routing.ts
└── index.ts
```

Responsibilities:

```text
.kal

↓

Compiler

↓

Vite
```

---

# CLI Package

```text
packages/cli/

src/

├── commands/
│
│   ├── create.ts
│   ├── dev.ts
│   ├── build.ts
│   ├── start.ts
│   └── generate.ts
│
├── prompts/
│
└── index.ts
```

Commands:

```bash
kallo create
kallo dev
kallo build
kallo start
```

---

# Create Kallo Package

Separate from CLI.

Like:

```bash
npx create-kallo
```

Structure:

```text
packages/create-kallo/

src/

├── templates/
│
│   ├── ecommerce/
│   ├── blog/
│   ├── dashboard/
│   └── minimal/
│
└── index.ts
```

---

# Shared Package

This package becomes gold later.

```text
packages/shared/

src/

├── logger.ts
├── constants.ts
├── path.ts
├── cache.ts
├── env.ts
├── errors.ts
└── index.ts
```

Anything duplicated twice goes here.

---

# Types Package

```text
packages/types/

src/

├── page.ts
├── route.ts
├── metadata.ts
├── compiler.ts
├── server.ts
└── index.ts
```

Avoid circular dependencies.

Everything imports from here.

---

# The Future Architecture

Once Kallo matures:

```text
packages/

compiler
runtime
server
router
reactivity
auth
metadata
forms
validation
css
vite-plugin
cli
create-kallo
shared
types
```

---

# One Architectural Change I'd Make

I would actually split the compiler immediately into three packages:

```text
packages/

kallo-parser
kallo-compiler
kallo-vite-plugin
```

Because eventually you'll want:

```text
VSCode extension
CLI
Language server
Build system
```

all consuming the same parser.

Then the dependency graph becomes:

```text
parser
   ↓

compiler
   ↓

vite-plugin
```

instead of:

```text
compiler
does
everything
```

which becomes painful after 6–12 months.

If I were building Kallo for real, my first six packages would be:

```text
@kallojs/parser
@kallojs/compiler
@kallojs/runtime
@kallojs/server
@kallojs/vite-plugin
@kallojs/cli
```

Everything else would be layered on top of those. That gives you a clean separation between syntax, compilation, runtime behavior, server behavior, and developer tooling—the same boundaries that tend to survive long-term as frameworks grow.
