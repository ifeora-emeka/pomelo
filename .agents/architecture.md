For a framework project, I would strongly recommend a **monorepo-first architecture** where every major responsibility is its own package.

Don't build Pomelo as one giant codebase.

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
pomelo/

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
│   ├── create-pomelo/
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

This is the heart of Pomelo.

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
page.pom

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
import { $local } from "@pomelo/runtime";
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
import { createServer }
from "@pomelo/server";
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
.pom

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
pomelo create
pomelo dev
pomelo build
pomelo start
```

---

# Create Pomelo Package

Separate from CLI.

Like:

```bash
npx create-pomelo
```

Structure:

```text
packages/create-pomelo/

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

Once Pomelo matures:

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
create-pomelo
shared
types
```

---

# One Architectural Change I'd Make

I would actually split the compiler immediately into three packages:

```text
packages/

pomelo-parser
pomelo-compiler
pomelo-vite-plugin
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

If I were building Pomelo for real, my first six packages would be:

```text
@pomelo/parser
@pomelo/compiler
@pomelo/runtime
@pomelo/server
@pomelo/vite-plugin
@pomelo/cli
```

Everything else would be layered on top of those. That gives you a clean separation between syntax, compilation, runtime behavior, server behavior, and developer tooling—the same boundaries that tend to survive long-term as frameworks grow.
