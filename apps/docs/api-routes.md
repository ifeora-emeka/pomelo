---
title: API Routes
description: Define JSON/HTTP endpoints with $router in src/api, using the Express mental model.
category: Server
order: 2
---

# API Routes

Place HTTP endpoints in `src/api`. They use `$router`, which feels like Express:

```ts
// src/api/index.ts
import { $router } from "@kallojs/server";

const router = $router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/echo", (req, res) => {
  res.json({ youSent: req.body });
});

export default router;
```

Routes are mounted automatically. Because Kallo is built on Express, request and response objects follow the Express API, and Kallo adds response helpers for common patterns.

> Use API routes for JSON endpoints and webhooks; use `<Server>` blocks (`$page`) for the data a page renders.
