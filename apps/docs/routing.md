---
title: Routing & Layouts
description: File-based routing in Kallo — pages, nested layouts, dynamic params, catch-all routes, and not-found/error pages.
category: Core Concepts
order: 1
---

# Routing & Layouts

Kallo uses **file-based routing**. The structure of `src/view` defines your URLs.

## Pages

Any `page.kal` becomes a route:

```text
src/view/page.kal              ->  /
src/view/about/page.kal        ->  /about
src/view/blog/hello/page.kal   ->  /blog/hello
```

## Layouts

A `layout.kal` wraps every page in and below its folder. Render the page where you want it with `<Slot />`:

```html
<View>
  <html lang="en">
    <head>
      <link rel="stylesheet" href="/tailwind.css">
    </head>
    <body>
      <nav>…</nav>
      <main>
        <Slot />
      </main>
    </body>
  </html>
</View>
```

Layouts nest: a layout deeper in the tree is rendered inside the layouts above it.

## Dynamic routes

Wrap a segment in brackets to capture it. The value is available as `params` in the `<Server>` block:

```text
src/view/products/[id]/page.kal   ->  /products/:id
```

```html
<Server>
  $page(async ({ params }) => {
    const product = await getProduct(params.id);
    return { product };
  });
</Server>
```

## Catch-all routes

Use `[...name]` to match the rest of the path:

```text
src/view/docs/[...slug]/page.kal  ->  /docs/*
```

```html
<Server>
  $page(async ({ params }) => {
    // params.slug === "guide/intro" for /docs/guide/intro
    return { slug: params.slug };
  });
</Server>
```

## Not found & errors

- `src/view/not-found.kal` renders for unmatched routes (404).
- `src/view/error.kal` renders when a page throws.
