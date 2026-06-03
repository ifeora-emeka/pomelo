import { PomeloLogger } from "@pomelo/shared";
import fs from "node:fs";
import path from "node:path";

export function executeCreateCommand(args: string[]): boolean {
  const appName = args[0] || "my-pomelo-app";
  const targetDir = path.resolve(process.cwd(), appName);

  const templateIdx = args.indexOf("--template");
  let template = "ecommerce";
  if (templateIdx !== -1 && args[templateIdx + 1]) {
    template = args[templateIdx + 1]!;
  }
  if (template === "default") {
    template = "ecommerce";
  }

  PomeloLogger.info(
    `Scaffolding new Pomelo project in ${targetDir} with template '${template}'...`,
  );

  if (fs.existsSync(targetDir)) {
    PomeloLogger.warn(`Directory ${appName} already exists!`);
    return false;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/pages"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/components"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "src/stores"), { recursive: true });

    // Write package.json
    fs.writeFileSync(
      path.join(targetDir, "package.json"),
      JSON.stringify(
        {
          name: appName,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "pomelo dev",
            build: "pomelo build",
            start: "pomelo start",
          },
          dependencies: {
            "@pomelo/runtime": "workspace:*",
            "@pomelo/server": "workspace:*",
          },
          devDependencies: {
            "@pomelo/cli": "workspace:*",
          },
        },
        null,
        2,
      ),
    );

    if (template === "ecommerce") {
      fs.writeFileSync(
        path.join(targetDir, "src/stores/cart.ts"),
        `import { $store } from "@pomelo/runtime";

export const useCartStore = $store({
  items: (typeof window !== "undefined" && localStorage.getItem("pomelo_cart"))
    ? JSON.parse(localStorage.getItem("pomelo_cart") || "[]")
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
      localStorage.setItem("pomelo_cart", JSON.stringify(this.items));
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
        localStorage.setItem("pomelo_cart", JSON.stringify(this.items));
      }
    }
  },
  getQuantity(id: string) {
    const item = this.items.find((i) => i.id === id);
    return item ? item.qty : 0;
  },
  clear() {
    this.items = [];
    if (typeof window !== "undefined") {
      localStorage.removeItem("pomelo_cart");
    }
  }
});
`,
      );

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
  category: string;
  rating: number;
}

export class ProductService {
  private products: Product[] = [
    {
      id: "1",
      name: "Ultra-wide 4K Monitor",
      price: 449,
      description: "Experience stunning clarity with our 34-inch ultra-wide curved 4K monitor. Perfect for gaming and productivity.",
      image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=60",
      category: "Electronics",
      rating: 4.8
    },
    {
      id: "2",
      name: "Premium Wireless Headset",
      price: 149,
      description: "Lossless audio quality with active noise cancellation and up to 40 hours of battery life.",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60",
      category: "Audio",
      rating: 4.6
    },
    {
      id: "3",
      name: "Mechanical Gaming Keyboard",
      price: 99,
      description: "Tactile blue switches, per-key RGB backlighting, and solid aluminum frame for ultimate durability.",
      image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=60",
      category: "Peripherals",
      rating: 4.7
    },
    {
      id: "4",
      name: "Ergonomic Office Chair",
      price: 249,
      description: "High-back mesh chair with adjustable lumbar support, 3D armrests, and dynamic reclining function.",
      image: "https://images.unsplash.com/photo-1505797149-43b0069ec26b?w=500&auto=format&fit=crop&q=60",
      category: "Furniture",
      rating: 4.5
    }
  ];

  getAllProducts(): Product[] {
    return this.products;
  }

  getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }
}
`,
      );

      fs.mkdirSync(path.join(targetDir, "src/api/products/controllers"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(
          targetDir,
          "src/api/products/controllers/product.controller.ts",
        ),
        `import { ProductService } from "../services/product.service.js";

const productService = new ProductService();

export class ProductController {
  static getProducts(req: any, res: any) {
    const products = productService.getAllProducts();
    res.ok(products);
  }

  static getProduct(req: any, res: any) {
    const { id } = req.params;
    const product = productService.getProductById(id);
    if (!product) {
      res.notFound(\`Product with ID \\\${id} not found\`);
    } else {
      res.ok(product);
    }
  }
}
`,
      );

      // 3. API Route
      fs.mkdirSync(path.join(targetDir, "src/api/products"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/api/products/products.api.ts"),
        `import { $router } from "@pomelo/server";
import { ProductController } from "./controllers/product.controller.js";

const router = $router();

router.get("/", ProductController.getProducts);
router.get("/:id", ProductController.getProduct);

export default router;
`,
      );

      // 5. ProductCard Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/ProductCard.pom"),
        `<View>
  <div class="product-card">
    <div class="image-wrapper">
      <img :src="product.image" :alt="product.name" class="product-image" />
    </div>
    <div class="card-content">
      <span class="category-badge">{{ product.category }}</span>
      <h3><a :href="'/products/' + product.id" class="product-link">{{ product.name }}</a></h3>
      <div class="price-row">
        <span class="price">\${{ product.price }}</span>
        <button class="add-button" @click="addToCart(product)">
          <When condition="inCart">
            Added ({{ cartCount }})
          </When>
          <Else>
            Add to Cart
          </Else>
        </button>
      </div>
    </div>
  </div>
</View>

<Style scoped>
  .product-card {
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid #334155;
    border-radius: 20px;
    overflow: hidden;
    transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
    backdrop-filter: blur(12px);
  }
  .product-card:hover {
    transform: translateY(-5px);
    border-color: #475569;
    box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.3);
  }
  .image-wrapper {
    height: 220px;
    overflow: hidden;
    background-color: #1e293b;
    border-bottom: 1px solid #334155;
  }
  .product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s ease;
  }
  .product-card:hover .product-image {
    transform: scale(1.05);
  }
  .card-content {
    padding: 1.5rem;
  }
  .category-badge {
    display: inline-block;
    background-color: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .card-content h3 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    font-weight: 700;
  }
  .product-link {
    color: #f8fafc;
    text-decoration: none;
    transition: color 0.2s;
  }
  .product-link:hover {
    color: #38bdf8;
  }
  .price-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .price {
    font-size: 1.5rem;
    font-weight: 800;
    color: #38bdf8;
  }
  .add-button {
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #475569;
    padding: 0.5rem 1.25rem;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s, border-color 0.2s;
  }
  .add-button:hover {
    background: #0284c7;
    border-color: #0284c7;
  }
</Style>
`,
      );

      // 6. ProductInfo Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/ProductInfo.pom"),
        `<View>
  <div class="product-info-wrapper">
    <span class="category-badge">{{ product.category }}</span>
    <h1 class="product-title">{{ product.name }}</h1>
    <div class="rating-row">
      <span class="stars">★</span> {{ product.rating }} / 5.0 Rating
    </div>
    <p class="product-price">\${{ product.price }}</p>
    <p class="product-description">{{ product.description }}</p>
  </div>
</View>

<Style scoped>
  .category-badge {
    display: inline-block;
    background-color: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }
  .product-title {
    font-size: 2.5rem;
    font-weight: 900;
    margin: 0 0 1rem;
    background: linear-gradient(to right, #f8fafc, #cbd5e1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .rating-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #94a3b8;
    margin-bottom: 1.5rem;
  }
  .stars {
    color: #f59e0b;
    font-size: 1.25rem;
  }
  .product-price {
    font-size: 2.25rem;
    font-weight: 800;
    color: #38bdf8;
    margin: 0 0 1.5rem;
  }
  .product-description {
    color: #94a3b8;
    line-height: 1.75;
    margin: 0 0 2rem;
    font-size: 1.1rem;
  }
</Style>
`,
      );

      // 7. QuantitySelector Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/QuantitySelector.pom"),
        `<View>
  <div class="quantity-selector">
    <button class="qty-btn" @click="decrement()">-</button>
    <span class="qty-display">{{ quantity }}</span>
    <button class="qty-btn" @click="increment()">+</button>
  </div>
</View>

<Style scoped>
  .quantity-selector {
    display: flex;
    align-items: center;
    border: 1px solid #334155;
    border-radius: 12px;
    background: #1e293b;
    padding: 0.25rem;
  }
  .qty-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    font-weight: 700;
    width: 2.5rem;
    height: 2.5rem;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;
    border-radius: 8px;
  }
  .qty-btn:hover {
    color: #f8fafc;
    background-color: #334155;
  }
  .qty-display {
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
        path.join(targetDir, "src/pages/layout.pom"),
        `<Server>
  $page(async () => {
    return {
      storeName: "Pomelo Elite Tech Store"
    };
  });
</Server>

<Client>
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
        path.join(targetDir, "src/pages/page.pom"),
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
      title: "Pomelo Elite Tech Store - Home of Premium Tech",
      description: "Discover our premium tech product catalog. Shop wireless headsets, mechanical keyboards, ultra-wide 4K monitors, and ergonomic furniture."
    };
  });
</Server>

<Client>
  import { useCartStore } from "../stores/cart.js";
  import ProductCard from "../components/ProductCard.pom";

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
      fs.mkdirSync(path.join(targetDir, "src/pages/products/[id]"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/pages/products/[id]/layout.pom"),
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
        path.join(targetDir, "src/pages/products/[id]/page.pom"),
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
      title: state.product ? state.product.name + " | Pomelo Store" : "Product Not Found",
      description: state.product ? state.product.description : "View our premium product details."
    };
  });
</Server>

<Client>
  import { useCartStore } from "../../../stores/cart.js";
  import { $local } from "@pomelo/runtime";
  import ProductInfo from "../../../components/ProductInfo.pom";
  import QuantitySelector from "../../../components/QuantitySelector.pom";

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
        `import { $store } from "@pomelo/runtime";

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

      // 2. API Route
      fs.mkdirSync(path.join(targetDir, "src/api/subscription"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/api/subscription/subscription.api.ts"),
        `import { $router } from "@pomelo/server";

const router = $router();

router.get("/", (req, res) => {
  res.ok({ status: "active", plan: "Pro Plan", price: 29 });
});

export default router;
`,
      );

      // 3. Home page
      fs.writeFileSync(
        path.join(targetDir, "src/pages/index.pom"),
        `<Server>
  $page(async () => {
    return {
      title: "Pomelo SaaS Platform"
    };
  });
</Server>

<Client>
  import { useUserStore } from "../stores/user.js";
  import { $local } from "@pomelo/runtime";

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
        `import { $store } from "@pomelo/runtime";

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

      // 2. API Route
      fs.mkdirSync(path.join(targetDir, "src/api/posts"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/api/posts/posts.api.ts"),
        `import { $router } from "@pomelo/server";

const router = $router();

router.get("/", (req, res) => {
  res.ok([
    { id: "1", title: "Getting Started with Pomelo", summary: "Learn the fundamentals of the fast, Express-friendly monorepo framework." },
    { id: "2", title: "Why Reactivity Matters", summary: "Deep-dive into proxies and signals in web application performance." }
  ]);
});

export default router;
`,
      );

      // 3. Home page
      fs.writeFileSync(
        path.join(targetDir, "src/pages/index.pom"),
        `<Server>
  $page(async () => {
    return {
      posts: [
        { id: "1", title: "Getting Started with Pomelo", summary: "Learn the fundamentals of the fast, Express-friendly monorepo framework." },
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
      <h1>Pomelo Developer Blog</h1>
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
      fs.mkdirSync(path.join(targetDir, "src/pages/posts/[id]"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(targetDir, "src/pages/posts/[id]/page.pom"),
        `<Server>
  $page(async ({ params }) => {
    const posts = [
      { id: "1", title: "Getting Started with Pomelo", content: "Pomelo makes fullstack development delightful. By utilizing a familiar Express paradigm on the server combined with single-file component structure, we achieve near-zero compile overhead and rapid rendering times." },
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
        path.join(targetDir, "src/pages/index.pom"),
        `<Server>
  $page(async () => {
    return { title: "Welcome to Pomelo!" };
  });
</Server>

<Client>
  import { $local } from "@pomelo/runtime";
  const count = $local(0);
</Client>

<View>
  <main class="container">
    <h1>{{ title }}</h1>
    <p>Get started by editing <code>src/pages/index.pom</code></p>
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
    }

    PomeloLogger.info(`Successfully created project ${appName}!`);
    return true;
  } catch (err) {
    PomeloLogger.error("Failed to scaffold project: " + String(err));
    return false;
  }
}
