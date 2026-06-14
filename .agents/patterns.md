I would lean into a few core principles for Kallo:

1. **Single File Components** (`.kal`)
2. **TypeScript first**
3. **Server by default**
4. **No Virtual DOM exposed to developers**
5. **Signal-like reactivity but without calling them signals**
6. **Express mental model everywhere**
7. **HTML-first templates**
8. **Few magic keywords**
9. **Everything starts with `$` instead of `_`**

The `$` reads better:

```ts
$page();
$guard();
$store();
$watch();
$action();
```

than:

```ts
_page();
_guard();
_store();
_watch();
```

---

# Example 1 — Global Cart Store

`src/stores/cart.store.ts`

```ts
import { $store } from "@kallo/runtime";

type CartItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
};

export const cartStore = $store({
  items: [] as CartItem[],

  total() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },

  count() {
    return this.items.reduce((sum, item) => sum + item.qty, 0);
  },

  add(product: CartItem) {
    const existing = this.items.find((i) => i.id === product.id);

    if (existing) {
      existing.qty++;
      return;
    }

    this.items.push({
      ...product,
      qty: 1,
    });
  },

  remove(productId: number) {
    this.items = this.items.filter((item) => item.id !== productId);
  },
});
```

Usage anywhere:

```ts
const cart = $use(cartStore);

cart.add(product);
```

---

# Example 2 — Product Listing Page

`src/view/products/page.kal`

```html
<Server lang="ts">
  $page(async ({ query }) => { const products = await ProductService.list({
  search: query.search }); return { products }; }); $meta(() => ({ title:
  "Products", description: "Browse all products in our catalog" }));
</Server>

<Client lang="ts">
  import { cartStore } from "@/stores/cart.store"; const cart = $use(cartStore);
  const search = $local(""); const addToCart = (product: Product) => {
  cart.add(product); }; $watch(search, async value => { console.log(value); });
</Client>

<View>
  <section>
    <h1>Products</h1>

    <input
      type="text"
      :value="search"
      @input="search = $event.target.value"
      placeholder="Search products"
    />

    <div class="grid">
      <Each of="products" as="product" key="product.id">
        <article class="card">
          <img :src="product.image" :alt="product.name" />

          <h3>{{ product.name }}</h3>

          <p>${{ product.price }}</p>

          <button @click="addToCart(product)">Add To Cart</button>
        </article>
      </Each>
    </div>
  </section>
</View>

<style scoped>
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
  }

  .card {
    border: 1px solid #ddd;
    padding: 16px;
  }
</style>
```

---

# Example 3 — Product Details Page

`src/view/products/[id]/page.kal`

```html
<Server lang="ts">
  $page(async ({ params }) => { const product = await ProductService.getById(
  params.id ); if (!product) { $abort(404); } return { product }; }); $meta(({
  product }) => ({ title: product.name, description: product.description, image:
  product.image, canonical: `/products/${product.id}` }));
</Server>

<Client lang="ts">
  import { cartStore } from "@/stores/cart.store"; const cart = $use(cartStore);
  const quantity = $local(1); const addToCart = () => { cart.add({ ...product,
  qty: quantity }); };
</Client>

<View>
  <section>
    <img :src="product.image" :alt="product.name" />

    <h1>{{ product.name }}</h1>

    <p>{{ product.description }}</p>

    <h2>${{ product.price }}</h2>

    <select
      :value="quantity"
      @change="
			quantity =
			Number($event.target.value)
		"
    >
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
    </select>

    <button @click="addToCart">Add To Cart</button>
  </section>
</View>

<style scoped>
  img {
    width: 100%;
    max-width: 500px;
  }
</style>
```

---

# Example 4 — API Route

This is where I would differentiate Kallo from Next.

Instead of:

```ts
export async function GET();
```

use actual Express-style syntax.

`src/api/products/products.api.ts`

```ts
import { $router } from "@kallo/server";

const router = $router();

router.get("/", $productListController);

router.get("/:id", $productDetailsController);

router.post("/", $auth(), $admin(), $productCreateController);

export default router;
```

Controller:

```ts
// src/api/products/controllers/create.controller.ts

export const productCreateController = async (req, res) => {
  const product = await ProductService.create(req.body);

  return res.created(product);
};
```

Service:

```ts
// src/api/products/services/product.service.ts

export class ProductService {
  static async create(data) {
    return prisma.product.create({
      data,
    });
  }

  static async list() {
    return prisma.product.findMany();
  }

  static async getById(id) {
    return prisma.product.findUnique({
      where: { id },
    });
  }
}
```

---

# Full Project Structure

```text
src/

├── pages/
│
│   ├── page.kal
│
│   ├── products/
│   │
│   ├── page.kal
│   │
│   └── [id]/
│       └── page.kal
│
│
├── api/
│
│   ├── products/
│   │
│   ├── products.api.ts
│   │
│   ├── controllers/
│   │   ├── create.controller.ts
│   │   ├── list.controller.ts
│   │   └── details.controller.ts
│   │
│   ├── services/
│   │   └── product.service.ts
│   │
│   └── validators/
│       └── create.validator.ts
│
│
├── stores/
│   ├── cart.store.ts
│   └── auth.store.ts
│
│
├── middleware/
│   ├── auth.ts
│   ├── admin.ts
│   └── logger.ts
│
│
├── components/
│   ├── ProductCard.kal
│   ├── Navbar.kal
│   └── Footer.kal
│
│
├── layouts/
│   ├── MainLayout.kal
│   └── AuthLayout.kal
│
│
├── services/
│   ├── auth.service.ts
│   └── payment.service.ts
│
│
├── hooks/
│   ├── use-cart.ts
│   └── use-auth.ts
│
│
├── app.ts
│
└── kallo.config.ts
```

---

# Core Kallo Keywords

Server:

```ts
$page();
$meta();
$guard();
$layout();
$redirect();
$abort();
$cache();
$headers();
$cookies();
$session();
```

Client:

```ts
$local();
$store();
$use();
$watch();
$action();
$next();
$mount();
$destroy();
```

Rendering:

```html
<Each />
<When />
<Else />
<slot />
<Portal />
```

Events:

```html
@click @change @input @submit @focus @blur @keydown @keyup
```

Data Binding:

```html
:value :class :style :disabled :checked :selected
```

If I were designing Kallo today, the biggest DX decision would be:

```html
<Server />
<Client />
<View />
<style />
```

instead of Vue's `<template>` and React's JSX.

Those four blocks immediately tell developers:

- server logic
- client logic
- UI
- styling

without borrowing React's component model or Vue's naming conventions too heavily, while still feeling familiar enough that a React/Vue developer can become productive in minutes.
