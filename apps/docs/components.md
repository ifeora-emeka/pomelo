---
title: Components
description: Build reusable .kal components, pass props via colon bindings, and compose them inside views.
category: Core Concepts
order: 3
---

# Components

Components are `.kal` files you import and use inside a `<View>`.

## Defining a component

```html
<!-- src/components/ProductCard.kal -->
<View>
  <div class="card">
    <h3>{{ product.name }}</h3>
    <p>{{ '$' + product.price }}</p>
    <button @click="onAdd(product)">Add</button>
  </div>
</View>
```

## Using a component

Import it in the `<Client>` (or `<Server>`) block, then use it like a tag. Pass **props** with `:` bindings — including function props for callbacks:

```html
<Client>
  import ProductCard from "../components/ProductCard.kal";
  import { useCart } from "../stores/cart.js";

  const cart = useCart;
  const addToCart = (product) => cart.add(product, 1);
</Client>

<View>
  <div class="grid">
    <Each of="products" as="product">
      <ProductCard :product="product" :onAdd="addToCart" />
    </Each>
  </div>
</View>
```

Inside the component, props are referenced directly by name (`product`, `onAdd`). Data props are reactive; function props let a child notify its parent.
