---
title: Server, Data & SEO
description: The Server block — $page for server-side data fetching and $meta for per-page SEO metadata.
category: Server
order: 1
---

# Server, Data & SEO

The `<Server>` block runs **only on the server**. It is stripped from the client bundle, so it is safe to read the file system, query a database, or use secrets here.

## Fetching data — `$page`

`$page` returns the state your view renders with. It receives the request context, including route `params`:

```html
<Server>
  import { getProductById } from "../data/products.js";

  $page(async ({ params }) => {
    const product = await getProductById(params.id);
    if (!product) return { product: null };
    return { product };
  });
</Server>

<View>
  <When condition="product">
    <h1>{{ product.name }}</h1>
  </When>
</View>
```

The returned object is rendered on the server **and** serialized so the client hydrates with the same state.

## Metadata & SEO — `$meta`

`$meta` sets the document metadata for the page. Set it in `layout.kal` for site-wide defaults and override per page:

```html
<Server>
  $meta(() => ({
    title: "Aura Wireless Headphones",
    description: "Studio sound, all-day comfort.",
    canonical: "https://example.com/products/aura",
    robots: "index,follow",
    openGraph: {
      title: "Aura Wireless Headphones",
      type: "product",
      image: "https://example.com/aura.jpg",
      siteName: "My Store",
    },
    twitter: { card: "summary_large_image" },
  }));
</Server>
```

Supported fields include `title`, `description`, `canonical`, `robots`, `viewport`, `openGraph` (`title`, `description`, `type`, `url`, `image`, `siteName`) and `twitter` (`card`, `site`, `creator`, `title`, `description`, `image`). Layout and page metadata are deep-merged.
