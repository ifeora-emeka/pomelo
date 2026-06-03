# Pomelo 🍊

![Pomelo Banner](https://www.shutterstock.com/image-photo/red-pomelo-citrus-fruit-banner-260nw-2095057009.jpg)

> **TypeScript-First, HTML-First Fullstack Framework built on Express.**
> Pomelo combines the server-side simplicity and familiarity of Express with a powerful compiler, reactive client-side runtime, and modern file-based routing.

---

## 🚀 Key Features

- **Single File Components (`.pom`)**: Clean, intuitive separation of concerns into four distinct blocks: `<Server>`, `<Client>`, `<View>`, and `<Style scoped>`.
- **TypeScript-First**: Type safety out of the box with zero compilation configuration.
- **Express Mental Model**: Familiar middleware, routes, and controllers on the server.
- **Signal-Like Reactivity**: Seamless state management using `$local`, `$store`, and `$watch` without exposing virtual DOM complexities.
- **File-Based Routing**: Zero-config path and layout resolution from the filesystem (`layout.pom`, `page.pom`).
- **Built-in Metadata / SEO**: Dynamic, SSR-safe `<head>` injection via `$meta()`.
- **Optimized Performance**: Scoped CSS, fast server-side rendering (SSR), and lazy client-side hydration.

---

## 📦 Monorepo Package Structure

Pomelo is structured as a Turborepo monorepo to maintain clean boundaries between features:

```text
pomelo/
├── apps/
│   ├── www/          # Marketing website for Pomelo
│   ├── docs/         # Documentation website
│   └── playground/   # Interactive browser playground
├── packages/
│   ├── parser/       # Parses .pom files into a deterministic AST
│   ├── compiler/     # Compiles .pom AST into production-ready JS modules
│   ├── runtime/      # Client-side reactivity, lifecycle, and hydration engine
│   ├── server/       # SSR rendering, routing, middleware, and Express wrapper
│   ├── vite-plugin/  # Vite integration, hot module replacement (HMR), and file-based routing sync
│   ├── cli/          # Pomelo CLI tools (dev, build, start, create)
│   ├── shared/       # Cross-package utility functions
│   └── types/        # Unified TypeScript typings for the framework
```

---

## 🛠️ The `.pom` Component Anatomy

Pomelo components use the `.pom` extension. They are compiled at build time to produce optimized, reactive client-side modules and server-side render functions.

### Example: Product Detail Page (`src/pages/products/[id]/page.pom`)

```jsx
<Server lang="ts">
  // Server-side data fetching and API definition $page(async ({ params }) => {
  const product = await ProductService.getById(params.id); if (!product) {
  $abort(404); } return { product }; }); $meta(({ product }) => ({ title:
  `${product.name} | Pomelo Store`, description: product.description, image:
  product.image, canonical: `/products/${product.id}` }));
</Server>

<Client lang="ts">
  import { cartStore } from "@/stores/cart.store"; const cart = $use(cartStore);
  const quantity = $local(1); const addToCart = () => { cart.add({ ...product,
  qty: quantity.value }); };
</Client>

<View>
  <section class="product-detail">
    <img :src="product.image" :alt="product.name" />
    <h1>{{ product.name }}</h1>
    <p>{{ product.description }}</p>
    <h2>${{ product.price }}</h2>

    <div class="actions">
      <select
        :value="quantity"
        @change="quantity = Number($event.target.value)"
      >
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
      </select>

      <button @click="addToCart">Add To Cart</button>
    </div>
  </section>
</View>

<style scoped>
  .product-detail {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }
  img {
    width: 100%;
    max-height: 400px;
    object-fit: cover;
    border-radius: 8px;
  }
  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }
</style>
```

---

## 🚦 Routing & API Endpoints

Pomelo relies on an Express-compatible router and standard request/response handling.

### Example: Product Router (`src/api/products/products.api.ts`)

```ts
import { $router } from "@pomelo/server";
import { auth, admin } from "@/middleware/auth";
import { listProducts, getProduct, createProduct } from "./controllers";

const router = $router();

router.get("/", listProducts);
router.get("/:id", getProduct);
router.post("/", auth(), admin(), createProduct);

export default router;
```

---

## ⚡ Global Reactivity (`$store`)

State management in Pomelo is handled via reactive stores defined with `$store()`.

### Example: Global Cart Store (`src/stores/cart.store.ts`)

```ts
import { $store } from "@pomelo/runtime";

export const cartStore = $store({
  items: [] as CartItem[],

  total() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },

  add(product: CartItem) {
    const existing = this.items.find((item) => item.id === product.id);
    if (existing) {
      existing.qty++;
      return;
    }
    this.items.push({ ...product, qty: 1 });
  },
});
```

---

## 💻 Development & Building

This project utilizes `pnpm` and `Turborepo` for package management and task orchestrations.

### Prerequisites

Ensure you have Node.js (>= 18) and `pnpm` installed.

### Commands

- **Install Dependencies**:
  ```bash
  pnpm install
  ```
- **Run Development Server**:
  ```bash
  pnpm dev
  ```
- **Build All Packages & Applications**:
  ```bash
  pnpm build
  ```
- **Run Type Checking**:
  ```bash
  pnpm check-types
  ```
- **Run Linting**:
  ```bash
  pnpm lint
  ```
- **Format Code**:
  ```bash
  pnpm format
  ```

---

## 🍊 Testing and Running in Isolation

For framework developers, always test features in isolation by scaffolding a test project inside the `temp/` directory (which is ignored by Git):

1. **Build the framework**:

   ```bash
   pnpm build
   ```

2. **Scaffold a new project in the `temp/` directory**:

   ```bash
   node packages/cli/dist/bin.js create temp/my-test-app --template ecommerce
   ```

3. **Navigate to the project**:

   ```bash
   cd temp/my-test-app
   ```

4. **Install dependencies** (which resolves workspace packages locally):

   ```bash
   pnpm install
   ```

5. **Start the development server**:
   ```bash
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser to verify it.
