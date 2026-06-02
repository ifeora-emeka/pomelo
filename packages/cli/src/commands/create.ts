import { PomeloLogger } from "@pomelo/shared";
import fs from "node:fs";
import path from "node:path";

export function executeCreateCommand(args: string[]): boolean {
  const appName = args[0] || "my-pomelo-app";
  const targetDir = path.resolve(process.cwd(), appName);

  const templateIdx = args.indexOf("--template");
  let template = "default";
  if (templateIdx !== -1 && args[templateIdx + 1]) {
    template = args[templateIdx + 1]!;
  }

  PomeloLogger.info(`Scaffolding new Pomelo project in ${targetDir} with template '${template}'...`);

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
            "@pomelo/cli": "workspace:*"
          }
        },
        null,
        2
      )
    );

    if (template === "ecommerce") {
      // 1. Store
      fs.writeFileSync(
        path.join(targetDir, "src/stores/cart.ts"),
        `import { $store } from "@pomelo/runtime";

export const useCartStore = $store({
  items: [] as Array<{ id: string; name: string; price: number; qty: number }>,
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
  },
  clear() {
    this.items = [];
  }
});
`
      );

      // 2. API Route
      fs.mkdirSync(path.join(targetDir, "src/pages/api"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/pages/api/products.pom"),
        `<Server>
  $page(async ({ req, res }) => {
    res.ok([
      { id: "1", name: "Premium Wireless Headset", price: 149 },
      { id: "2", name: "Mechanical Gaming Keyboard", price: 99 },
      { id: "3", name: "Ultra-wide 4K Monitor", price: 449 }
    ]);
  });
</Server>
`
      );

      // 3. Home page
      fs.writeFileSync(
        path.join(targetDir, "src/pages/index.pom"),
        `<Server>
  $page(async () => {
    return {
      storeName: "Pomelo E-Commerce Store"
    };
  });
</Server>

<Client>
  import { useCartStore } from "../stores/cart.js";
  import { $local } from "@pomelo/runtime";

  const products = $local([
    { id: "1", name: "Premium Wireless Headset", price: 149 },
    { id: "2", name: "Mechanical Gaming Keyboard", price: 99 },
    { id: "3", name: "Ultra-wide 4K Monitor", price: 449 }
  ]);

  const cart = useCartStore;
</Client>

<View>
  <div class="app">
    <header class="header">
      <h1>{{ storeName }}</h1>
      <div class="cart-badge">🛒 Cart ({{ cart.count }}) - \${{ cart.total }}</div>
    </header>

    <main class="grid">
      <Each of="products" as="p">
        <div class="product-card">
          <h3>{{ p.name }}</h3>
          <p class="price">\${{ p.price }}</p>
          <button @click="cart.addItem(p)">Add to Cart</button>
        </div>
      </Each>
    </main>
  </div>
</View>

<Style>
  .app { font-family: system-ui, sans-serif; padding: 2rem; max-width: 1000px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 1rem; }
  .cart-badge { background: #10b981; color: white; padding: 0.5rem 1rem; border-radius: 9999px; font-weight: bold; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 2rem; }
  .product-card { border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
  .price { font-size: 1.25rem; font-weight: bold; color: #3b82f6; margin: 0.5rem 0 1rem; }
  button { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: 600; }
  button:hover { background: #2563eb; }
</Style>
`
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
`
      );

      // 2. API Route
      fs.mkdirSync(path.join(targetDir, "src/pages/api"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/pages/api/subscription.pom"),
        `<Server>
  $page(async ({ req, res }) => {
    res.ok({ status: "active", plan: "Pro Plan", price: 29 });
  });
</Server>
`
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
`
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
`
      );

      // 2. API Route
      fs.mkdirSync(path.join(targetDir, "src/pages/api"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/pages/api/posts.pom"),
        `<Server>
  $page(async ({ req, res }) => {
    res.ok([
      { id: "1", title: "Getting Started with Pomelo", summary: "Learn the fundamentals of the fast, Express-friendly monorepo framework." },
      { id: "2", title: "Why Reactivity Matters", summary: "Deep-dive into proxies and signals in web application performance." }
    ]);
  });
</Server>
`
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
`
      );

      // 4. Dynamic post detail page
      fs.mkdirSync(path.join(targetDir, "src/pages/posts"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/pages/posts/[id].pom"),
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
`
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
`
      );
    }

    PomeloLogger.info(`Successfully created project ${appName}!`);
    return true;
  } catch (err) {
    PomeloLogger.error("Failed to scaffold project: " + String(err));
    return false;
  }
}
