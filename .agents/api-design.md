# API Design — Pomelo Framework

## Overview

This document defines the design principles and conventions for all **server-side APIs** in Pomelo.

Pomelo APIs are built on top of Express, but expose a structured, opinionated layer for scalability, type safety, and consistent DX.

The API layer must remain:

* Express-compatible underneath
* Framework-consistent above
* Explicit in behavior
* Modular by feature/domain

---

## Core Principles

### 1. Express First, Framework Second

All APIs compile down to Express handlers.

However, developers must not directly depend on Express in application code unless inside low-level server packages.

---

### 2. Feature-Based Structure

APIs are organized by domain, not by technical layer.

Preferred:

```text
src/api/products/
src/api/auth/
src/api/cart/
```

Avoid:

```text
controllers/
services/
routes/
```

as top-level separation.

Each feature contains its own controller, service, and middleware.

---

### 3. Explicit Routing

All routes must be explicitly declared.

No hidden auto-routing from filenames (except optional adapter layer).

Example:

```ts
const router = $router();

router.get("/", listProducts);
router.get("/:id", getProduct);
router.post("/", createProduct);

export default router;
```

---

## Routing System

### Route Definition

Routes are defined using `$router()`.

Supported methods:

* `get`
* `post`
* `put`
* `patch`
* `delete`

Example:

```ts
router.post(
  "/checkout",
  auth(),
  validateCheckout,
  checkoutController
);
```

---

### Route Parameters

Dynamic parameters follow Express convention:

```text
/products/:id
/users/:userId/orders/:orderId
```

Accessed via:

```ts
req.params.id
```

---

## Controllers

Controllers are pure request handlers.

### Rules

* Must not contain business logic
* Must delegate to services
* Must return response explicitly

### Example

```ts
export const getProductController = async (req, res) => {
  const product = await ProductService.getById(req.params.id);

  if (!product) {
    return res.notFound();
  }

  return res.ok(product);
};
```

---

## Services

Services contain business logic.

### Rules

* No HTTP awareness
* No Express dependencies
* Fully reusable

### Example

```ts
export class ProductService {
  static async getById(id: string) {
    return db.product.findUnique({
      where: { id }
    });
  }

  static async list() {
    return db.product.findMany();
  }
}
```

---

## Middleware System

Middleware is composable and explicit.

### Built-in middleware pattern

```ts
auth()
admin()
rateLimit()
validate(schema)
```

### Usage

```ts
router.post(
  "/admin/products",
  auth(),
  admin(),
  createProductController
);
```

---

## Authentication & Authorization

Auth is middleware-based.

### Auth middleware

```ts
auth()
```

Attaches:

```ts
req.user
```

---

### Role-based access

```ts
admin()
```

or:

```ts
roles("admin", "manager")
```

---

## Response Helpers

All responses should use Pomelo response helpers:

### Standard responses

```ts
res.ok(data)
res.created(data)
res.updated(data)
res.deleted()
```

### Error responses

```ts
res.badRequest(message)
res.unauthorized()
res.forbidden()
res.notFound()
res.serverError()
```

---

## Validation Layer

Validation runs before controller execution.

### Example

```ts
router.post(
  "/",
  validate(CreateProductSchema),
  createProductController
);
```

Validation must:

* Run before controller
* Throw structured errors
* Never be embedded inside controllers

---

## Error Handling

Errors are centralized.

### Rule

Do not use try/catch inside controllers unless absolutely necessary.

Instead:

* Throw domain errors
* Let global error handler process them

Example:

```ts
throw new NotFoundError("Product not found");
```

---

## API Versioning

Pomelo supports versioned APIs.

### Structure

```text
src/api/v1/products
src/api/v2/products
```

Or:

```ts
/app/api/v1
/app/api/v2
```

Only one version is active by default.

---

## File Organization (Feature Module)

Recommended structure:

```text
src/api/products/

├── products.api.ts
├── controllers/
│   ├── list.controller.ts
│   ├── get.controller.ts
│   └── create.controller.ts
├── services/
│   └── product.service.ts
├── middleware/
│   └── product.middleware.ts
├── validators/
│   └── product.schema.ts
└── types.ts
```

---

## Data Flow

Request lifecycle:

```text
Request
  ↓
Middleware
  ↓
Validation
  ↓
Controller
  ↓
Service
  ↓
Database
  ↓
Response Helper
  ↓
Client
```

---

## Security Rules

* Never trust client input
* Always validate request bodies
* Always sanitize query params
* Never expose internal errors to clients
* Never leak stack traces in production

---

## Performance Rules

* Avoid heavy logic in middleware
* Cache expensive service calls where appropriate
* Prefer pagination over full dataset returns
* Avoid N+1 queries in services

---

## Dependency Rules

Allowed:

* services → db
* controllers → services
* routes → controllers + middleware

Not allowed:

* services → controllers
* middleware → services (except auth context enrichment)
* compiler/runtime → api layer

---

## Design Philosophy

Pomelo APIs should feel:

* predictable
* explicit
* structured like Express
* scalable like NestJS
* lightweight like Fastify

But never overly abstracted.

---

## Future Extensions

Planned API enhancements:

* RPC-style internal calls
* GraphQL adapter layer
* WebSocket API module
* Background job API layer
* Event-driven API hooks
