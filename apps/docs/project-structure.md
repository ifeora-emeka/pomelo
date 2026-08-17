---
title: Project Structure
description: How a Kallo app is organized — the src/view router, components, stores, API routes, and styles.
category: Getting Started
order: 3
---

# Project Structure

A typical Kallo app looks like this:

```text
my-app/
  src/
    view/                 # file-based routes
      layout.kal          # shared shell (html/head/body)
      page.kal            # the "/" route
      not-found.kal       # 404 page
      error.kal           # error page
      products/
        [id]/page.kal     # dynamic route -> /products/:id
    components/           # reusable .kal components
    stores/               # shared reactive stores ($store)
    api/                  # API routes ($router)
    styles/
      global.css          # Tailwind entry + theme tokens
  public/                 # static assets (served at /)
  .env / .env.local       # environment variables
  package.json
```

## Conventions

- **`src/view`** is the router. Every `page.kal` becomes a route; folders become path segments.
- **`layout.kal`** wraps the pages beneath it and renders a `<Slot />` for the page content.
- **`[param]`** folders are dynamic segments; **`[...param]`** folders are catch-all segments.
- **`public/`** is served at the site root — `public/logo.png` is available at `/logo.png`.
- Single-file components use the **`.kal`** extension.

See [Routing & Layouts](/docs/routing) for the details.
