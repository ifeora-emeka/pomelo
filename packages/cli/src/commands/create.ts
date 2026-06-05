import { KalloLogger } from "@kallo/shared";
import fs from "node:fs";
import path from "node:path";

export function executeCreateCommand(args: string[]): boolean {
  const appName = args[0] || "my-kallo-app";
  const targetDir = path.resolve(process.cwd(), appName);
  const pkgName = path.basename(targetDir);

  const templateIdx = args.indexOf("--template");
  let template = "ecommerce";
  if (templateIdx !== -1 && args[templateIdx + 1]) {
    template = args[templateIdx + 1]!;
  }
  if (template === "default") {
    template = "ecommerce";
  }

  KalloLogger.info(
    `Scaffolding new Kallo project in ${targetDir} with template '${template}'...`,
  );

  if (fs.existsSync(targetDir)) {
    KalloLogger.warn(`Directory ${appName} already exists!`);
    return false;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/view"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/components"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/stores"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/api"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "public"), { recursive: true });

    // Write package.json
    fs.writeFileSync(
      path.join(targetDir, "package.json"),
      JSON.stringify(
        {
          name: pkgName,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "kallo dev",
            build: "kallo build",
            start: "kallo start",
          },
          dependencies: {
            "@kallo/runtime": "workspace:*",
            "@kallo/server": "workspace:*",
          },
          devDependencies: {
            "@kallo/cli": "workspace:*",
            "tailwindcss": "^3.4.1",
            "postcss": "^8.4.35",
            "autoprefixer": "^10.4.18",
          },
        },
        null,
        2,
      ),
    );

    // Write Tailwind and PostCSS Configs
    fs.writeFileSync(
      path.join(targetDir, "tailwind.config.js"),
      `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js,ts,kal}",
    "./index.html"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`
    );

    fs.writeFileSync(
      path.join(targetDir, "postcss.config.js"),
      `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`
    );

    fs.mkdirSync(path.join(targetDir, "src/styles"), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, "src/styles/global.css"),
      `@tailwind base;
@tailwind components;
@tailwind utilities;
`
    );

    if (template === "ecommerce") {
      fs.writeFileSync(
        path.join(targetDir, "src/stores/cart.ts"),
        `import { $store } from "@kallo/runtime";

export const useCartStore = $store({
  items: (typeof window !== "undefined" && localStorage.getItem("kallo_cart"))
    ? JSON.parse(localStorage.getItem("kallo_cart") || "[]")
    : [] as Array<{ id: string; name: string; price: number; qty: number }>,
  get total() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },
  get count() {
    return this.items.reduce((sum, item) => sum + item.qty, 0);
  },
  addItem(item: { id: string; name: string; price: number }) {
    const existing = this.items.find((i) => i.id === item.id);
    if (existing) {
      existing.qty++;
    } else {
      this.items.push({ ...item, qty: 1 });
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("kallo_cart", JSON.stringify(this.items));
    }
  },
  removeItem(id: string) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx !== -1) {
      const item = this.items[idx];
      if (item.qty > 1) {
        item.qty--;
      } else {
        this.items.splice(idx, 1);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("kallo_cart", JSON.stringify(this.items));
      }
    }
  },
  getQuantity(id: string) {
    const found = this.items.find((i) => i.id === id);
    return found ? found.qty : 0;
  }
});
`,
      );

      // 2. API Services
      fs.mkdirSync(path.join(targetDir, "src/api/products/services"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/api/products/services/product.service.ts"),
        `export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
}

export class ProductService {
  private products: Product[] = [
    {
      id: "1",
      name: "Quantum Wireless Headset",
      price: 199.99,
      description: "Experience spatial audio precision with zero-latency wireless connectivity, designed for high-fidelity gaming and audio engineering.",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60"
    },
    {
      id: "2",
      name: "Cybernetic Mechanical Keyboard",
      price: 159.99,
      description: "Hot-swappable tactile switches embedded in an aircraft-grade aluminum frame, illuminated by programmable per-key dynamic RGB.",
      image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=60"
    },
    {
      id: "3",
      name: "Apex 4K Curved Monitor",
      price: 699.99,
      description: "Immerse yourself in a 34-inch ultra-wide 120Hz display, featuring vibrant HDR600 contrast and an elegant 1500R curved profile.",
      image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=60"
    },
    {
      id: "4",
      name: "Ergonomic Lumbar Desk Chair",
      price: 349.99,
      description: "Engineered with breathable mesh and adaptive lumbar support, featuring multi-dimensional armrests for sustained daily comfort.",
      image: "https://images.unsplash.com/photo-1580481072645-022f9a6dbf27?w=500&auto=format&fit=crop&q=60"
    }
  ];

  getAllProducts(): Product[] {
    return this.products;
  }

  getProductById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }
}
`,
      );

      // 3. API Controller
      fs.mkdirSync(path.join(targetDir, "src/api/products/controllers"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/api/products/controllers/product.controller.ts"),
        `import { ProductService } from "../services/product.service.js";

const productService = new ProductService();

export function getProducts(req: any, res: any) {
  res.ok(productService.getAllProducts());
}

export function getProduct(req: any, res: any) {
  const product = productService.getProductById(req.params.id);
  if (!product) {
    return res.notFound({ message: "Product not found" });
  }
  res.ok(product);
}
`,
      );

      // 4. API Routes
      fs.writeFileSync(
        path.join(targetDir, "src/api/products/products.api.ts"),
        `import { $router } from "@kallo/server";
import { getProducts, getProduct } from "./controllers/product.controller.js";

const router = $router();

router.get("/", getProducts);
router.get("/:id", getProduct);

export default router;
`,
      );

      // 4b. API Entry Point
      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallo/server";
import productRoutes from "./products/products.api.js";

const router = $router();

router.use("/products", productRoutes);

export default router;
`,
      );

      // 5. ProductCard Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/ProductCard.kal"),
        `<View>
  <div class="card" :class="{ 'in-cart': inCart }">
    <div class="img-wrapper">
      <img :src="product.image" :alt="product.name" class="img" />
    </div>
    <div class="info">
      <h3 class="title">
        <a :href="'/products/' + product.id">{{ product.name }}</a>
      </h3>
      <p class="desc">{{ product.description }}</p>
      <div class="footer">
        <span class="price">\${{ product.price }}</span>
        <button class="btn" @click="addToCart(product)">
          <When condition="inCart">
            Add More ({{ cartCount }})
          </When>
          <Else>
            Add to Cart
          </Else>
        </button>
      </div>
    </div>
  </div>
</View>

<Style>
  .card {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid #334155;
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(8px);
  }
  .card:hover {
    transform: translateY(-4px);
    border-color: #475569;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.3);
  }
  .card.in-cart {
    border-color: #38bdf8;
    background: rgba(14, 165, 233, 0.05);
  }
  .img-wrapper {
    height: 200px;
    overflow: hidden;
    background: #1e293b;
  }
  .img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s ease;
  }
  .card:hover .img {
    transform: scale(1.05);
  }
  .info {
    padding: 1.5rem;
  }
  .title {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 700;
  }
  .title a {
    color: #f8fafc;
    text-decoration: none;
    transition: color 0.2s;
  }
  .title a:hover {
    color: #38bdf8;
  }
  .desc {
    margin: 0 0 1.5rem 0;
    color: #94a3b8;
    font-size: 0.875rem;
    line-height: 1.5;
    height: 3rem;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .price {
    font-size: 1.25rem;
    font-weight: 800;
    color: #f8fafc;
  }
  .btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn:hover {
    background: #38bdf8;
    color: #0f172a;
    border-color: #38bdf8;
  }
</Style>
`,
      );

      // 6. ProductInfo Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/ProductInfo.kal"),
        `<View>
  <div class="info-block">
    <h1 class="name">{{ product.name }}</h1>
    <div class="price-badge">\${{ product.price }}</div>
    <p class="description">{{ product.description }}</p>
  </div>
</View>

<Style>
  .info-block {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .name {
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0;
    color: #f8fafc;
    line-height: 1.2;
  }
  .price-badge {
    font-size: 1.75rem;
    font-weight: 800;
    color: #38bdf8;
  }
  .description {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0;
  }
</Style>
`,
      );

      // 7. QuantitySelector Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/QuantitySelector.kal"),
        `<View>
  <div class="selector">
    <button class="control-btn" @click="quantity.set(Math.max(1, quantity.get() - 1))">-</button>
    <span class="value">{{ quantity }}</span>
    <button class="control-btn" @click="quantity.set(quantity.get() + 1)">+</button>
  </div>
</View>

<Style>
  .selector {
    display: inline-flex;
    align-items: center;
    border: 1px solid #334155;
    background: #1e293b;
    border-radius: 12px;
    overflow: hidden;
  }
  .control-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    width: 3rem;
    height: 3rem;
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  .control-btn:hover {
    background: #334155;
    color: #f8fafc;
  }
  .value {
    font-size: 1.1rem;
    font-weight: 700;
    width: 3rem;
    text-align: center;
    color: #f8fafc;
  }
</Style>
`,
      );

      // 8. Root Layout
      fs.writeFileSync(
        path.join(targetDir, "src/view/layout.kal"),
        `<Server>
  $page(async () => {
    return {
      storeName: "Kallo Elite Tech Store"
    };
  });
</Server>

<Client>
  import "../styles/global.css";
  import { useCartStore } from "../stores/cart.js";
  const cart = useCartStore;
</Client>

<View>
  <div class="container">
    <header class="header">
      <div class="logo-section">
        <a href="/" class="logo">{{ storeName }}</a>
      </div>
      <div class="cart-status">
        🛒 Cart ({{ cart.count }}) - \${{ cart.total }}
      </div>
    </header>
    <Slot />
  </div>
</View>

<Style>
  body {
    margin: 0;
    font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
    background-color: #0f172a;
    color: #f8fafc;
  }
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #334155;
    margin-bottom: 2rem;
  }
  .logo {
    font-size: 1.75rem;
    font-weight: 800;
    text-decoration: none;
    background: linear-gradient(to right, #38bdf8, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .cart-status {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    font-weight: 700;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
  }
</Style>
`,
      );

      // 9. Root Page
      fs.writeFileSync(
        path.join(targetDir, "src/view/page.kal"),
        `<Server>
  import { ProductService } from "../api/products/services/product.service.js";

  const productService = new ProductService();

  $page(async () => {
    const products = productService.getAllProducts();
    return {
      products
    };
  });

  $meta(() => {
    return {
      title: "Kallo Elite Tech Store - Home of Premium Tech",
      description: "Discover our premium tech product catalog. Shop wireless headsets, mechanical keyboards, ultra-wide 4K monitors, and ergonomic furniture."
    };
  });
</Server>

<Client>
  import { useCartStore } from "../stores/cart.js";
  import ProductCard from "../components/ProductCard.kal";

  const cart = useCartStore;

  function addToCart(product) {
    cart.addItem(product);
  }
</Client>

<View>
  <div>
    <div class="hero">
      <h2 class="hero-title">Elevate Your Setup</h2>
      <p class="hero-subtitle">High-performance tools meticulously crafted for creators, developers, and gamers.</p>
    </div>

    <main class="grid">
      <Each of="products" as="product">
        <ProductCard
          :product="product"
          :inCart="cart.getQuantity(product.id) > 0"
          :cartCount="cart.getQuantity(product.id)"
          :addToCart="addToCart"
        />
      </Each>
    </main>
  </div>
</View>

<Style>
  .hero {
    text-align: center;
    padding: 4rem 1rem;
    background: radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
    margin-bottom: 3rem;
  }
  .hero-title {
    font-size: 3.5rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    margin-bottom: 1rem;
    background: linear-gradient(to right, #f8fafc, #cbd5e1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .hero-subtitle {
    font-size: 1.25rem;
    color: #94a3b8;
    max-width: 600px;
    margin: 0 auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 2rem;
  }
</Style>
`,
      );

      // 10. Product Details Layout
      fs.mkdirSync(path.join(targetDir, "src/view/products/[id]"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/view/products/[id]/layout.kal"),
        `<View>
  <div class="details-layout">
    <div class="back-link-container">
      <a href="/" class="back-link">← Back to Store</a>
    </div>
    <Slot />
  </div>
</View>

<Style>
  .details-layout {
    width: 100%;
  }
  .back-link-container {
    margin-bottom: 2rem;
  }
  .back-link {
    color: #38bdf8;
    text-decoration: none;
    font-weight: 600;
    transition: color 0.2s ease;
  }
  .back-link:hover {
    color: #7dd3fc;
  }
</Style>
`,
      );

      // 11. Product Details Page
      fs.writeFileSync(
        path.join(targetDir, "src/view/products/[id]/page.kal"),
        `<Server>
  import { ProductService } from "../../../api/products/services/product.service.js";

  const productService = new ProductService();

  $page(async ({ params }) => {
    const product = productService.getProductById(params.id);
    if (!product) {
      $abort(404, "Product not found");
    }
    return {
      product
    };
  });

  $meta((state) => {
    return {
      title: state.product ? state.product.name + " | Kallo Store" : "Product Not Found",
      description: state.product ? state.product.description : "View our premium product details."
    };
  });
</Server>

<Client>
  import { useCartStore } from "../../../stores/cart.js";
  import { $local } from "@kallo/runtime";
  import ProductInfo from "../../../components/ProductInfo.kal";
  import QuantitySelector from "../../../components/QuantitySelector.kal";

  const cart = useCartStore;
  
  const quantity = $local(1);

  function increment() {
    quantity.set(quantity.get() + 1);
  }

  function decrement() {
    if (quantity.get() > 1) {
      quantity.set(quantity.get() - 1);
    }
  }

  function handleAddToCart(product) {
    Array.from({ length: quantity.get() }).forEach(() => {
      cart.addItem(product);
    });
    quantity.set(1);
  }
</Client>

<View>
  <main class="product-detail">
    <div class="product-image-container">
      <img :src="product.image" :alt="product.name" class="product-image" />
    </div>
    <div class="product-info">
      <ProductInfo :product="product" />

      <div class="add-to-cart-section">
        <QuantitySelector :quantity="quantity" />
        <button class="add-btn" @click="handleAddToCart(product)">
          <When condition="cart.getQuantity(product.id) > 0">
            Added ({{ cart.getQuantity(product.id) }} in Cart)
          </When>
          <Else>
            Add to Cart
          </Else>
        </button>
      </div>
    </div>
  </main>
</View>

<Style>
  .product-detail {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    align-items: start;
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid #334155;
    border-radius: 24px;
    padding: 3rem;
    backdrop-filter: blur(12px);
  }
  .product-image-container {
    border-radius: 16px;
    overflow: hidden;
    background: #1e293b;
    border: 1px solid #334155;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  }
  .product-image {
    width: 100%;
    height: auto;
    display: block;
    object-fit: cover;
  }
  .product-info {
    display: flex;
    flex-direction: column;
  }
  .add-to-cart-section {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-top: 1rem;
  }
  .add-btn {
    flex: 1;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: white;
    border: none;
    padding: 1rem 2rem;
    border-radius: 12px;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    transition: transform 0.2s, box-shadow 0.2s, background-color 0.2s;
  }
  .add-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(2, 132, 199, 0.4);
    background: linear-gradient(135deg, #0ea5e9, #0284c7);
  }
  .add-btn:active {
    transform: translateY(0);
  }
  @media (max-width: 768px) {
    .product-detail {
      grid-template-columns: 1fr;
      gap: 2rem;
      padding: 1.5rem;
    }
  }
</Style>
`,
      );
    } else if (template === "SaaS" || template === "saas") {
      // 1. Store
      fs.writeFileSync(
        path.join(targetDir, "src/stores/user.ts"),
        `import { $store } from "@kallo/runtime";

export const useUserStore = $store({
  isLoggedIn: false,
  plan: "Free Trial",
  email: "",
  login(email: string) {
    this.isLoggedIn = true;
    this.email = email;
  },
  upgrade() {
    this.plan = "Pro Plan";
  }
});
`,
      );

      // 2. API Route & Services/Controllers
      fs.mkdirSync(path.join(targetDir, "src/api/subscription/services"), { recursive: true });
      fs.mkdirSync(path.join(targetDir, "src/api/subscription/controllers"), { recursive: true });

      fs.writeFileSync(
        path.join(targetDir, "src/api/subscription/services/subscription.service.ts"),
        `export class SubscriptionService {
  getSubscription() {
    return { status: "active", plan: "Pro Plan", price: 29 };
  }
}
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/subscription/controllers/subscription.controller.ts"),
        `import { SubscriptionService } from "../services/subscription.service.js";

const service = new SubscriptionService();

export function getSubscription(req: any, res: any) {
  res.ok(service.getSubscription());
}
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/subscription/subscription.api.ts"),
        `import { $router } from "@kallo/server";
import { getSubscription } from "./controllers/subscription.controller.js";

const router = $router();

router.get("/", getSubscription);

export default router;
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallo/server";
import subscriptionRoutes from "./subscription/subscription.api.js";

const router = $router();

router.use("/subscription", subscriptionRoutes);

export default router;
`
      );

      // 3. Home page
      fs.writeFileSync(
        path.join(targetDir, "src/view/index.kal"),
        `<Server>
  $page(async () => {
    return {
      title: "Kallo SaaS Platform"
    };
  });
</Server>

<Client>
  import { useUserStore } from "../stores/user.js";
  import { $local } from "@kallo/runtime";

  const user = useUserStore;
  const emailInput = $local("");

  function handleLogin() {
    if (emailInput.get()) {
      user.login(emailInput.get());
    }
  }
</Client>

<View>
  <div class="saas">
    <h1>{{ title }}</h1>
    <p class="subtitle">Next-gen analytical engine for fast developers</p>

    <If condition="!user.isLoggedIn">
      <div class="auth-box">
        <h3>Start your Free Trial</h3>
        <input type="email" :value="emailInput" @input="emailInput = $event.target.value" placeholder="Enter your email" />
        <button @click="handleLogin()">Get Started</button>
      </div>
    </If>

    <If condition="user.isLoggedIn">
      <div class="dashboard">
        <h2>Welcome back, {{ user.email }}!</h2>
        <p>Your current plan: <strong>{{ user.plan }}</strong></p>
        <If condition="user.plan === 'Free Trial'">
          <button class="upgrade-btn" @click="user.upgrade()">Upgrade to Pro (\$29/mo)</button>
        </If>
        <If condition="user.plan === 'Pro Plan'">
          <p class="success-msg">🎉 Thank you for subscribing to Pro!</p>
        </If>
      </div>
    </If>
  </div>
</View>

<Style>
  .saas { font-family: system-ui, sans-serif; text-align: center; padding: 4rem 2rem; max-width: 600px; margin: 0 auto; }
  .subtitle { font-size: 1.25rem; color: #666; margin-bottom: 2rem; }
  .auth-box, .dashboard { border: 1px solid #eee; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 15px rgba(0,0,0,0.05); }
  input { padding: 0.75rem; width: 80%; border: 1px solid #ccc; border-radius: 6px; margin-bottom: 1rem; font-size: 1rem; }
  button { background: #6366f1; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-weight: bold; width: 80%; }
  button:hover { background: #4f46e5; }
  .upgrade-btn { background: #10b981; }
  .upgrade-btn:hover { background: #059669; }
  .success-msg { color: #10b981; font-weight: bold; }
</Style>
`,
      );
    } else if (template === "blog") {
      // 1. Store
      fs.writeFileSync(
        path.join(targetDir, "src/stores/blog.ts"),
        `import { $store } from "@kallo/runtime";

export const useBlogStore = $store({
  likes: {} as Record<string, number>,
  likePost(id: string) {
    if (!this.likes[id]) {
      this.likes[id] = 0;
    }
    this.likes[id]++;
  }
});
`,
      );

      // 2. API Route & Services/Controllers
      fs.mkdirSync(path.join(targetDir, "src/api/posts/services"), { recursive: true });
      fs.mkdirSync(path.join(targetDir, "src/api/posts/controllers"), { recursive: true });

      fs.writeFileSync(
        path.join(targetDir, "src/api/posts/services/post.service.ts"),
        `export class PostService {
  getPosts() {
    return [
      { id: "1", title: "Getting Started with Kallo", summary: "Learn the fundamentals of the fast, Express-friendly monorepo framework." },
      { id: "2", title: "Why Reactivity Matters", summary: "Deep-dive into proxies and signals in web application performance." }
    ];
  }
}
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/posts/controllers/post.controller.ts"),
        `import { PostService } from "../services/post.service.js";

const service = new PostService();

export function getPosts(req: any, res: any) {
  res.ok(service.getPosts());
}
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/posts/posts.api.ts"),
        `import { $router } from "@kallo/server";
import { getPosts } from "./controllers/post.controller.js";

const router = $router();

router.get("/", getPosts);

export default router;
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallo/server";
import postsRoutes from "./posts/posts.api.js";

const router = $router();

router.use("/posts", postsRoutes);

export default router;
`
      );

      // 3. Home page
      fs.writeFileSync(
        path.join(targetDir, "src/view/index.kal"),
        `<Server>
  $page(async () => {
    return {
      posts: [
        { id: "1", title: "Getting Started with Kallo", summary: "Learn the fundamentals of the fast, Express-friendly monorepo framework." },
        { id: "2", title: "Why Reactivity Matters", summary: "Deep-dive into proxies and signals in web application performance." }
      ]
    };
  });
</Server>

<Client>
  import { useBlogStore } from "../stores/blog.js";
  const blogState = useBlogStore;
</Client>

<View>
  <div class="blog">
    <header>
      <h1>Kallo Developer Blog</h1>
    </header>

    <main class="posts">
      <Each of="posts" as="post">
        <article class="post-preview">
          <h2><a href="/posts/{{ post.id }}">{{ post.title }}</a></h2>
          <p>{{ post.summary }}</p>
          <div class="actions">
            <button @click="blogState.likePost(post.id)">👍 Like ({{ blogState.likes[post.id] || 0 }})</button>
          </div>
        </article>
      </Each>
    </main>
  </div>
</View>

<Style>
  .blog { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
  header { border-bottom: 2px solid #eaeaea; padding-bottom: 1rem; margin-bottom: 2rem; }
  .post-preview { border-bottom: 1px solid #eee; padding: 1.5rem 0; }
  .post-preview h2 a { color: #1a1a1a; text-decoration: none; }
  .post-preview h2 a:hover { color: #3b82f6; }
  .actions { margin-top: 1rem; }
  button { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
  button:hover { background: #e5e7eb; }
</Style>
`,
      );

      // 4. Dynamic post detail page
      fs.mkdirSync(path.join(targetDir, "src/view/posts/[id]"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/view/posts/[id]/page.kal"),
        `<Server>
  $page(async ({ params }) => {
    const posts = [
      { id: "1", title: "Getting Started with Kallo", content: "Kallo makes fullstack development delightful. By utilizing a familiar Express paradigm on the server combined with single-file component structure, we achieve near-zero compile overhead and rapid rendering times." },
      { id: "2", title: "Why Reactivity Matters", content: "Modern applications require smooth state updates. By separating reactive logic via deep proxies for store state and signals for local variables, components stay isolated and rendering updates are minimal." }
    ];
    const post = posts.find(p => p.id === params.id) || { title: "Post Not Found", content: "Sorry, that article could not be found." };
    return { post };
  });
</Server>

<View>
  <div class="post-detail">
    <a href="/">← Back to Blog</a>
    <h1>{{ post.title }}</h1>
    <p class="content">{{ post.content }}</p>
  </div>
</View>

<Style>
  .post-detail { font-family: system-ui, sans-serif; max-width: 700px; margin: 0 auto; padding: 3rem 2rem; }
  h1 { margin-top: 1.5rem; }
  .content { font-size: 1.125rem; line-height: 1.75; color: #333; margin-top: 1.5rem; }
  a { color: #3b82f6; text-decoration: none; }
</Style>
`,
      );
    } else {
      // Default template
      fs.writeFileSync(
        path.join(targetDir, "src/view/index.kal"),
        `<Server>
  $page(async () => {
    return { title: "Welcome to Kallo!" };
  });
</Server>

<Client>
  import { $local } from "@kallo/runtime";
  const count = $local(0);
</Client>

<View>
  <main class="container">
    <h1>{{ title }}</h1>
    <p>Get started by editing <code>src/view/index.kal</code></p>
    <button @click="count = count + 1">Clicked {{ count }} times</button>
  </main>
</View>

<Style>
  .container {
    font-family: system-ui, sans-serif;
    padding: 2rem;
    text-align: center;
  }
</Style>
`,
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallo/server";

const router = $router();

router.get("/", (req, res) => {
  res.ok({ message: "Welcome to Kallo API!" });
});

export default router;
`
      );
    }

    // Write Environment Config Files (.env, .env.local, .env.test)
    fs.writeFileSync(
      path.join(targetDir, ".env"),
      `# Main Kallo Environment Variables
KALLO_PUBLIC_API_URL=http://localhost:4000
DATABASE_URL=postgres://user:password@localhost:5432/kallodb
`
    );

    fs.writeFileSync(
      path.join(targetDir, ".env.local"),
      `# Local overrides for Kallo
KALLO_PUBLIC_APP_TITLE=My Kallo Ecommerce Store (Local)
API_SECRET_KEY=local_super_secret_api_key_12345
`
    );

    fs.writeFileSync(
      path.join(targetDir, ".env.test"),
      `# Test overrides for Kallo
KALLO_PUBLIC_APP_TITLE=My Kallo Ecommerce Store (Test)
API_SECRET_KEY=test_super_secret_api_key_12345
`
    );

    // Write Public Assets (custom.css, custom.js, favicon.ico)
    fs.writeFileSync(
      path.join(targetDir, "public/custom.css"),
      `/* Kallo Custom CSS Styles */
body {
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 0;
  background-color: #0b0f19;
  color: #f3f4f6;
}
`
    );

    fs.writeFileSync(
      path.join(targetDir, "public/custom.js"),
      `// Kallo Custom JS Script
console.log('Kallo custom.js loaded successfully from public directory!');
`
    );

    // A tiny valid 16x16 PNG for favicon.ico
    const faviconPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVR42mP8z8BQD8AEjDqAYVAZGA2DyoBhUBkYDYPKgGFQGRgNg8qAYVAZGA2DCgCt2gf82rr1OQAAAABJRU5ErkJggg==";
    fs.writeFileSync(
      path.join(targetDir, "public/favicon.ico"),
      Buffer.from(faviconPngBase64, "base64")
    );

    KalloLogger.info(`Successfully created project ${appName}!`);
    return true;
  } catch (err) {
    KalloLogger.error("Failed to scaffold project: " + String(err));
    return false;
  }
}
