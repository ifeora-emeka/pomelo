---
title: Reactivity & State
description: Client-side state in Kallo — $local for component state, $store for shared stores, plus $mount lifecycle.
category: Core Concepts
order: 4
---

# Reactivity & State

Kallo ships a tiny reactive runtime. State lives in **signals** created by `$local` and `$store`, imported from `@kallojs/runtime` inside a `<Client>` block.

## Local state — `$local`

```html
<Client>
  import { $local } from "@kallojs/runtime";

  const count = $local(0);
  const inc = () => count.set(count.get() + 1);
</Client>

<View>
  <button @click="inc()">Count: {{ count }}</button>
</View>
```

A signal exposes `.get()` and `.set()`. In the `<View>`, reference it by name (`{{ count }}`) — the runtime unwraps it for you.

## Shared state — `$store`

A `$store` is a reactive object shared across pages and components. Define it once and import it anywhere:

```ts
// src/stores/cart.ts
import { $store } from "@kallojs/runtime";

export const useCart = $store({
  items: [] as CartItem[],
  count: 0,
  add(product, qty) {
    this.items = [...this.items, { ...product, qty }];
    this.count += qty;
  },
});
```

```html
<Client>
  import { useCart } from "../stores/cart.js";
  const cart = useCart;
</Client>

<View>
  <span>Cart ({{ cart.count }})</span>
</View>
```

Assigning to a store property (`this.items = …`) triggers a re-render of anything that reads it.

## Lifecycle — `$mount`

Run code after the component hydrates in the browser:

```html
<Client>
  import { $mount } from "@kallojs/runtime";
  $mount(() => {
    console.log("mounted on the client");
  });
</Client>
```
