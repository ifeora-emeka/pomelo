import { KalloLogger } from "@kallojs/shared";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

async function askQuestion(query: string, defaultValue: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return defaultValue;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(query);
    return answer.trim() || defaultValue;
  } catch {
    return defaultValue;
  } finally {
    rl.close();
  }
}

export async function executeCreateCommand(args: string[]): Promise<boolean> {
  const emptyIdx = args.indexOf("--empty");
  const isEmpty = emptyIdx !== -1;

  const appName = args.find(a => !a.startsWith("-")) || "my-kallo-app";
  const targetDir = path.resolve(process.cwd(), appName);
  const pkgName = path.basename(targetDir);

  let packageManager = "pnpm";
  let useTailwind = true;
  let _setupAuth = false;
  let template = "empty";

  const templateIdx = args.indexOf("--template");
  const templateArgVal = templateIdx !== -1 ? args[templateIdx + 1] : undefined;
  const templateFromArgs = templateArgVal ? templateArgVal.toLowerCase() : null;

  if (isEmpty) {
    template = "empty";
  } else {
    console.log("\n📦 Creating a new Kallo project...\n");
    const pmAnswer = await askQuestion("📋 Which package manager do you want to use? (pnpm/npm/yarn) [pnpm]: ", "pnpm");
    packageManager = pmAnswer.toLowerCase();
    if (!["pnpm", "npm", "yarn"].includes(packageManager)) {
      packageManager = "pnpm";
    }

    const twAnswer = await askQuestion("🎨 Do you want to use Tailwind CSS? (y/n) [y]: ", "y");
    useTailwind = twAnswer.toLowerCase().startsWith("y");

    const authAnswer = await askQuestion("🔑 Do you want to setup authentication? (y/n) [n]: ", "n");
    _setupAuth = authAnswer.toLowerCase().startsWith("y");

    if (templateFromArgs && ["saas", "blog", "empty"].includes(templateFromArgs)) {
      template = templateFromArgs;
    } else {
      const tempAnswer = await askQuestion("📄 Choose a template (saas/blog/empty) [empty]: ", "empty");
      template = tempAnswer.toLowerCase();
      if (!["saas", "blog", "empty"].includes(template)) {
        template = "empty";
      }
    }
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
    // Published apps depend on real version ranges from npm. When scaffolding
    // inside the Kallo monorepo for local development, set KALLO_LOCAL_DEPS=true
    // to wire the generated app to the workspace packages instead.
    const kalloDep =
      process.env.KALLO_LOCAL_DEPS === "true" ? "workspace:*" : "^0.0.1";

    const devDeps: Record<string, string> = {
      "@kallojs/cli": kalloDep,
    };
    if (useTailwind) {
      devDeps["tailwindcss"] = "^4.0.0";
      devDeps["@tailwindcss/cli"] = "^4.0.0";
    }

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
            "@kallojs/runtime": kalloDep,
            "@kallojs/server": kalloDep,
          },
          devDependencies: devDeps,
        },
        null,
        2,
      ),
    );

    // Write Tailwind v4 Global CSS with Theme Config (CSS-first approach)
    if (useTailwind) {
      fs.mkdirSync(path.join(targetDir, "src/styles"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/styles/global.css"),
                `@import "tailwindcss";

@source "../**/*.kal";

@theme {
  --color-primary-50: #f5f3ff;
  --color-primary-100: #ede9fe;
  --color-primary-200: #ddd6fe;
  --color-primary-300: #c4b5fd;
  --color-primary-400: #a78bfa;
  --color-primary-500: #8b5cf6;
  --color-primary-600: #7c3aed;
  --color-primary-700: #6d28d9;
  --color-primary-800: #5b21b6;
  --color-primary-900: #4c1d95;
  --color-primary-950: #2e1065;

  --color-secondary-50: #ecfdf5;
  --color-secondary-100: #d1fae5;
  --color-secondary-200: #a7f3d0;
  --color-secondary-300: #6ee7b7;
  --color-secondary-400: #34d399;
  --color-secondary-500: #10b981;
  --color-secondary-600: #059669;
  --color-secondary-700: #047857;
  --color-secondary-800: #065f46;
  --color-secondary-900: #064e3b;
  --color-secondary-950: #022c22;

  --color-tertiary-50: #eff6ff;
  --color-tertiary-100: #dbeafe;
  --color-tertiary-200: #bfdbfe;
  --color-tertiary-300: #93c5fd;
  --color-tertiary-400: #60a5fa;
  --color-tertiary-500: #3b82f6;
  --color-tertiary-600: #2563eb;
  --color-tertiary-700: #1d4ed8;
  --color-tertiary-800: #1e40af;
  --color-tertiary-900: #1e3a8a;
  --color-tertiary-950: #172554;

  --color-neutral-50: #fafafa;
  --color-neutral-100: #f4f4f5;
  --color-neutral-200: #e4e4e7;
  --color-neutral-300: #d4d4d8;
  --color-neutral-400: #a1a1aa;
  --color-neutral-500: #71717a;
  --color-neutral-600: #52525b;
  --color-neutral-700: #3f3f46;
  --color-neutral-800: #27272a;
  --color-neutral-900: #18181b;
  --color-neutral-950: #09090b;

  --color-danger-50: #fef2f2;
  --color-danger-100: #fee2e2;
  --color-danger-200: #fecaca;
  --color-danger-300: #fca5a5;
  --color-danger-400: #f87171;
  --color-danger-500: #ef4444;
  --color-danger-600: #dc2626;
  --color-danger-700: #b91c1c;
  --color-danger-800: #991b1b;
  --color-danger-900: #7f1d1d;
  --color-danger-950: #450a0a;

  --color-success-50: #f0fdf4;
  --color-success-100: #dcfce7;
  --color-success-200: #bbf7d0;
  --color-success-300: #86efac;
  --color-success-400: #4ade80;
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  --color-success-700: #15803d;
  --color-success-800: #166534;
  --color-success-900: #14532d;
  --color-success-950: #052e16;

  --color-warning-50: #fffbeb;
  --color-warning-100: #fef3c7;
  --color-warning-200: #fde68a;
  --color-warning-300: #fcd34d;
  --color-warning-400: #fbbf24;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;
  --color-warning-700: #b45309;
  --color-warning-800: #92400e;
  --color-warning-900: #78350f;
  --color-warning-950: #451a03;

  --color-info-50: #ecfeff;
  --color-info-100: #cffafe;
  --color-info-200: #a5f3fc;
  --color-info-300: #67e8f9;
  --color-info-400: #22d3ee;
  --color-info-500: #06b6d4;
  --color-info-600: #0891b2;
  --color-info-700: #0e7490;
  --color-info-800: #155e75;
  --color-info-900: #164e63;
  --color-info-950: #083344;

  --color-bg-primary: var(--bg-primary);
  --color-bg-secondary: var(--bg-secondary);
  --color-bg-tertiary: var(--bg-tertiary);
  --color-foreground: var(--foreground);
  --color-border: var(--border);
}

:root {
  --bg-primary: var(--color-neutral-50);
  --bg-secondary: var(--color-neutral-100);
  --bg-tertiary: var(--color-neutral-200);
  --foreground: var(--color-neutral-900);
  --border: var(--color-neutral-300);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: var(--color-neutral-950);
    --bg-secondary: var(--color-neutral-900);
    --bg-tertiary: var(--color-neutral-800);
    --foreground: var(--color-neutral-100);
    --border: var(--color-neutral-700);
  }
}

body {
  background-color: var(--bg-primary);
  color: var(--foreground);
  margin: 0;
  font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
  transition: background-color 0.2s, color 0.2s;
}
`
      );
    }

    // Write default layout.kal for templates (other than ecommerce)
    const writeDefaultLayout = () => {
      fs.writeFileSync(
        path.join(targetDir, "src/view/layout.kal"),
        `<View>
  <html lang="en">
    <head>
      <title>Kallo App</title>
      <link rel="stylesheet" href="/tailwind.css">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=Inter:wght@100..900&display=swap" rel="stylesheet">
    </head>
    <body class="margin-0">
      <Slot />
    </body>
  </html>
</View>

<Style>
  .margin-0 {
    margin: 0;
  }
</Style>
`
      );
    };

    if (template === "empty") {
      // ── Task store (API-backed, explicit state for reliable reactivity)
      fs.writeFileSync(
        path.join(targetDir, "src/stores/tasks.ts"),
        `import { $store } from "@kallojs/runtime";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
}

export const useTaskStore = $store({
  tasks: [] as Task[],
  total: 0,
  completedCount: 0,
  pendingCount: 0,
  loading: false,
  error: "" as string,

  _recalc() {
    this.total = this.tasks.length;
    this.completedCount = this.tasks.filter((t: Task) => t.completed).length;
    this.pendingCount = this.tasks.filter((t: Task) => !t.completed).length;
  },

  setTasks(newTasks: Task[]) {
    this.tasks = [...newTasks];
    this._recalc();
  },

  async fetchTasks() {
    this.loading = true;
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        this.tasks = [...data];
        this._recalc();
      }
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },

  async addTask(title: string, priority: "low" | "medium" | "high") {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority }),
      });
      if (res.ok) {
        const task = await res.json();
        this.tasks = [...this.tasks, task];
        this._recalc();
      }
    } catch (e: any) {
      this.error = e.message;
    }
  },

  async toggleTask(id: string) {
    const idx = this.tasks.findIndex((t: Task) => t.id === id);
    if (idx === -1) return;
    const task = this.tasks[idx];
    const updated = { ...task, completed: !task.completed };
    const newTasks = [...this.tasks];
    newTasks[idx] = updated;
    this.tasks = newTasks;
    this._recalc();
    try {
      await fetch(\`/api/tasks/\${id}\`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: updated.completed }),
      });
    } catch (e: any) {
      this.error = e.message;
      const rollback = [...this.tasks];
      rollback[idx] = task;
      this.tasks = rollback;
      this._recalc();
    }
  },

  async deleteTask(id: string) {
    const prev = [...this.tasks];
    this.tasks = this.tasks.filter((t: Task) => t.id !== id);
    this._recalc();
    try {
      await fetch(\`/api/tasks/\${id}\`, { method: "DELETE" });
    } catch (e: any) {
      this.error = e.message;
      this.tasks = prev;
      this._recalc();
    }
  },
});
`
      );

      // ── Auth store (client-side session state)
      fs.writeFileSync(
        path.join(targetDir, "src/stores/auth.ts"),
        `import { $store } from "@kallojs/runtime";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export const useAuthStore = $store({
  user: null as AuthUser | null,
  loading: false,

  setUser(user: AuthUser | null) {
    this.user = user;
  },

  async signOut() {
    this.loading = true;
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      this.user = null;
      window.location.href = "/";
    } catch (e: any) {
      console.error("Sign out failed:", e.message);
    } finally {
      this.loading = false;
    }
  },

  async fetchSession() {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        this.user = data.user || null;
      }
    } catch {
      this.user = null;
    }
  },
});
`
      );

      fs.mkdirSync(path.join(targetDir, "src/components"), { recursive: true });

      // 5. EachTask Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/EachTask.kal"),
        `<View>
  <div class="flex justify-between items-center p-4 rounded-xl bg-bg-secondary border border-border hover:border-primary-400 transition-all duration-200" 
       :class="{ 'opacity-60 bg-bg-tertiary': task.completed }">
    <div class="flex items-center gap-3">
      <input type="checkbox" :checked="task.completed" @change="onToggle(task.id)" 
             class="w-5 h-5 rounded border-border text-primary-500 focus:ring-primary-500 cursor-pointer accent-primary-500" />
      <span class="text-sm font-semibold text-foreground" :class="{ 'line-through text-neutral-400': task.completed }">
        {{ task.title }}
      </span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs font-bold uppercase px-2 py-1 rounded" 
            :class="{
              'bg-info-100 text-info-700 border border-info-200': task.priority === 'low',
              'bg-warning-100 text-warning-700 border border-warning-200': task.priority === 'medium',
              'bg-danger-100 text-danger-700 border border-danger-200': task.priority === 'high'
            }">
        {{ task.priority }}
      </span>
      <button @click="onDelete(task.id)" 
              class="text-xs font-semibold text-danger-500 hover:text-white border border-danger-500 hover:bg-danger-500 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200">
        Delete
      </button>
    </div>
  </div>
</View>
`
      );

      // 6. ProjectStats Component
      fs.writeFileSync(
        path.join(targetDir, "src/components/ProjectStats.kal"),
        `<View>
  <div class="p-6 rounded-2xl bg-bg-secondary border border-border shadow-sm">
    <h3 class="text-lg font-bold text-foreground mb-4">Project Overview</h3>
    <div class="h-2 w-full bg-bg-tertiary rounded-full overflow-hidden mb-6">
      <div class="h-full bg-primary-500 transition-all duration-300" :style="'width: ' + completionPercentage + '%'"></div>
    </div>
    
    <div class="grid grid-cols-3 gap-4 text-center mb-6">
      <div class="flex flex-col p-2 bg-bg-primary rounded-xl border border-border">
        <span class="text-2xl font-extrabold text-foreground">{{ total }}</span>
        <span class="text-xs text-neutral-500 font-medium mt-1">Total Tasks</span>
      </div>
      <div class="flex flex-col p-2 bg-bg-primary rounded-xl border border-border">
        <span class="text-2xl font-extrabold text-success-600">{{ completed }}</span>
        <span class="text-xs text-neutral-500 font-medium mt-1">Completed</span>
      </div>
      <div class="flex flex-col p-2 bg-bg-primary rounded-xl border border-border">
        <span class="text-2xl font-extrabold text-warning-600">{{ pending }}</span>
        <span class="text-xs text-neutral-500 font-medium mt-1">Pending</span>
      </div>
    </div>
    
    <div class="text-sm font-semibold text-foreground flex justify-between items-center pt-4 border-t border-border">
      <span>Completion Rate:</span>
      <span class="text-primary-500 font-extrabold text-base">{{ completionPercentage }}%</span>
    </div>
  </div>
</View>
`
      );

      // 7. Root Layout (with SSR auth header)
      fs.writeFileSync(
        path.join(targetDir, "src/view/layout.kal"),
        `<Server>
  import { $currentUser } from "@kallojs/server";
  $page(async (ctx) => {
    const user = $currentUser(ctx);
    return { currentUser: user };
  });
</Server>

<View>
  <html lang="en">
    <head>
      <title>Kallo Task Flow</title>
      <link rel="stylesheet" href="/tailwind.css">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=Inter:wght@100..900&display=swap" rel="stylesheet">
    </head>
    <body class="bg-bg-primary text-foreground min-h-screen">
      <div class="max-w-6xl mx-auto p-6">
        <header class="flex justify-between items-center pb-4 border-b border-border mb-8">
          <a href="/" class="flex items-center gap-2 no-underline">
            <svg class="w-8 h-8 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span class="text-xl font-extrabold tracking-tight bg-gradient-to-r from-primary-500 to-tertiary-500 bg-clip-text text-transparent">Kallo Task Flow</span>
          </a>
          <nav class="flex items-center gap-3">
            <When condition="currentUser">
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-secondary border border-border">
                  <span class="w-2 h-2 rounded-full bg-success-500 animate-pulse"></span>
                  <span class="text-xs font-semibold text-foreground">{{ currentUser && currentUser.name }}</span>
                </div>
                <form action="/api/auth/signout" method="POST">
                  <button type="submit" class="text-xs font-semibold text-neutral-500 hover:text-danger-500 px-3 py-1.5 rounded-full border border-border bg-bg-secondary hover:border-danger-400 transition-all duration-200 cursor-pointer">
                    Sign Out
                  </button>
                </form>
              </div>
            </When>
            <Else>
              <div class="flex items-center gap-2">
                <a href="/login" class="text-xs font-semibold text-neutral-500 hover:text-foreground px-3 py-1.5 rounded-full border border-border bg-bg-secondary transition-all duration-200">Log In</a>
                <a href="/signup" class="text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 px-4 py-1.5 rounded-full transition-all duration-200">Sign Up</a>
              </div>
            </Else>
          </nav>
        </header>
        <main>
          <Slot />
        </main>
      </div>
    </body>
  </html>
</View>

<Style>
  a { text-decoration: none; }
</Style>
`
      );


      // 8. Root Page (client-side fetch for tasks, SSR for auth state)
      fs.writeFileSync(
        path.join(targetDir, "src/view/page.kal"),
        `<Server>
  $page(async () => {
    return {};
  });
</Server>

<Client>
  import { useTaskStore } from "../stores/tasks.js";
  import { $local, $mount } from "@kallojs/runtime";
  import EachTask from "../components/EachTask.kal";
  import ProjectStats from "../components/ProjectStats.kal";

  const taskStore = useTaskStore;
  const newTaskTitle = $local("");
  const newTaskPriority = $local("low");

  $mount(() => {
    taskStore.fetchTasks();
  });

  async function handleAddTask(e) {
    if (e) e.preventDefault();
    const title = newTaskTitle.get().trim();
    if (!title) return;
    await taskStore.addTask(title, newTaskPriority.get());
    newTaskTitle.set("");
  }

  async function handleToggle(id) {
    await taskStore.toggleTask(id);
  }

  async function handleDelete(id) {
    await taskStore.deleteTask(id);
  }
</Client>

<View>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
    <div class="md:col-span-2 flex flex-col gap-6">
      <h2 class="text-2xl font-extrabold text-foreground tracking-tight">My Tasks</h2>

      <form class="p-5 rounded-2xl bg-bg-secondary border border-border shadow-sm flex flex-col gap-4" @submit="handleAddTask(event)">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Task Title</label>
          <input
            type="text"
            :value="newTaskTitle"
            @input="newTaskTitle.set(event.target.value)"
            placeholder="What needs to be done?"
            class="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-foreground placeholder-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm transition-all duration-200"
          />
        </div>

        <div class="flex justify-between items-center gap-4">
          <div class="flex items-center gap-3">
            <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Priority</label>
            <select
              :value="newTaskPriority"
              @change="newTaskPriority.set(event.target.value)"
              class="px-3 py-2 rounded-lg border border-border bg-bg-primary text-foreground text-xs font-semibold focus:outline-none focus:border-primary-500 cursor-pointer"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <button type="submit" class="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm cursor-pointer shadow-md transition-all duration-200">
            Add Task
          </button>
        </div>
      </form>

      <div class="flex flex-col gap-3">
        <When condition="taskStore.total > 0">
          <Each of="taskStore.tasks" as="task">
            <EachTask
              :task="task"
              :onToggle="handleToggle"
              :onDelete="handleDelete"
            />
          </Each>
        </When>
        <Else>
          <div class="text-center p-12 border-2 border-dashed border-border rounded-2xl text-neutral-500 font-semibold">
            <When condition="taskStore.loading">
              <span>Loading tasks...</span>
            </When>
            <Else>
              <span>No tasks yet. Add your first task above!</span>
            </Else>
          </div>
        </Else>
      </div>
    </div>

    <div class="flex flex-col gap-6">
      <h2 class="text-2xl font-extrabold text-foreground tracking-tight">Project Status</h2>
      <ProjectStats
        :total="taskStore.total"
        :completed="taskStore.completedCount"
        :pending="taskStore.pendingCount"
        :completionPercentage="taskStore.total > 0 ? Math.round((taskStore.completedCount / taskStore.total) * 100) : 0"
      />
    </div>
  </div>
</View>
`

      );

      // 9. Root fallback: not-found.kal
      fs.writeFileSync(
        path.join(targetDir, "src/view/not-found.kal"),
        `<View>
  <div class="flex flex-col items-center justify-center text-center py-20 px-6">
    <div class="text-6xl font-black text-danger-500 mb-4 animate-bounce">404</div>
    <h1 class="text-3xl font-extrabold text-foreground mb-2">Page Not Found</h1>
    <p class="text-neutral-500 max-w-md mb-8">The page you are looking for doesn't exist or has been moved.</p>
    <a href="/" class="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-md transition-all duration-200">
      Go back home
    </a>
  </div>
</View>
`
      );

      // 10. Root fallback: error.kal
      fs.writeFileSync(
        path.join(targetDir, "src/view/error.kal"),
        `<View>
  <div class="flex flex-col items-center justify-center text-center py-20 px-6">
    <div class="text-6xl font-black text-danger-500 mb-4">500</div>
    <h1 class="text-3xl font-extrabold text-foreground mb-2">Application Error</h1>
    <p class="text-neutral-500 max-w-md mb-6">{{ error ? error.message : "An unexpected server-side error occurred." }}</p>
    
    <When condition="error && error.stack">
      <pre class="text-left bg-bg-secondary border border-border rounded-xl p-4 max-w-2xl overflow-x-auto text-xs text-danger-600 font-mono mb-8"><code>{{ error.stack }}</code></pre>
    </When>

    <a href="/" class="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-md transition-all duration-200">
      Go back home
    </a>
  </div>
</View>
`
      );

      // 11. Root fallback: unauthorized.kal
      fs.writeFileSync(
        path.join(targetDir, "src/view/unauthorized.kal"),
        `<View>
  <div class="flex flex-col items-center justify-center text-center py-20 px-6">
    <div class="text-6xl font-black text-warning-500 mb-4">403</div>
    <h1 class="text-3xl font-extrabold text-foreground mb-2">Unauthorized Access</h1>
    <p class="text-neutral-500 max-w-md mb-8">You do not have permission to view this resource.</p>
    <a href="/" class="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-md transition-all duration-200">
      Go back home
    </a>
  </div>
</View>
`
      );

      // ── Tasks API
      fs.mkdirSync(path.join(targetDir, "src/api/tasks"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/api/tasks/tasks.api.ts"),
        `import { $router } from "@kallojs/server";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
}

const tasks: Task[] = [];

const router = $router();

router.get("/", (_req, res) => {
  res.ok(tasks);
});

router.post("/", (req, res) => {
  const { title, priority } = req.body as { title?: string; priority?: string };
  if (!title || typeof title !== "string") {
    return res.badRequest("title is required");
  }
  const task: Task = {
    id: String(Date.now()),
    title: title.trim(),
    completed: false,
    priority: (["low", "medium", "high"].includes(priority ?? "") ? priority : "medium") as Task["priority"],
  };
  tasks.push(task);
  res.created(task);
});

router.patch("/:id", (req, res) => {
  const task = tasks.find((t) => t.id === req.params["id"]);
  if (!task) return res.notFound("Task not found");
  const { completed, title, priority } = req.body as Partial<Task>;
  if (typeof completed === "boolean") task.completed = completed;
  if (typeof title === "string") task.title = title.trim();
  if (priority && ["low", "medium", "high"].includes(priority)) task.priority = priority;
  res.ok(task);
});

router.delete("/:id", (req, res) => {
  const idx = tasks.findIndex((t) => t.id === req.params["id"]);
  if (idx === -1) return res.notFound("Task not found");
  tasks.splice(idx, 1);
  res.deleted();
});

export default router;
`
      );

      // ── Auth API
      fs.mkdirSync(path.join(targetDir, "src/api/auth"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/api/auth/auth.api.ts"),
        `import { $router, $setSessionCookie, $signOut, $currentUser } from "@kallojs/server";
import crypto from "node:crypto";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

const users: StoredUser[] = [];

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const router = $router();

router.post("/signup", (req, res) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
  if (!name || !email || !password) return res.badRequest("name, email, and password are required");
  if (users.find((u) => u.email === email)) return res.badRequest("Email already registered");
  const user: StoredUser = { id: String(Date.now()), name, email, passwordHash: hashPassword(password) };
  users.push(user);
  $setSessionCookie(res, { id: user.id, name: user.name, email: user.email });
  res.created({ id: user.id, name: user.name, email: user.email });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.badRequest("email and password are required");
  const user = users.find((u) => u.email === email && u.passwordHash === hashPassword(password));
  if (!user) return res.unauthorized("Invalid email or password");
  $setSessionCookie(res, { id: user.id, name: user.name, email: user.email });
  res.ok({ id: user.id, name: user.name, email: user.email });
});

router.post("/signout", (req, res) => {
  $signOut(res);
  res.redirect("/");
});

router.get("/session", (req, res) => {
  const user = $currentUser({ req });
  res.ok({ user: user || null });
});

export default router;
`
      );

      // ── API root index
      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallojs/server";
import tasksRoutes from "./tasks/tasks.api.js";
import authRoutes from "./auth/auth.api.js";

const router = $router();

router.use("/tasks", tasksRoutes);
router.use("/auth", authRoutes);

export default router;
`
      );

      // ── Login page
      fs.mkdirSync(path.join(targetDir, "src/view/login"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/view/login/page.kal"),
        `<Server>
  import { $currentUser } from "@kallojs/server";
  $page(async (ctx) => {
    const user = $currentUser(ctx);
    if (user) {
      ctx.res.redirect("/");
      return {};
    }
    return {};
  });
</Server>

<Client>
  import { $local } from "@kallojs/runtime";

  const email = $local("");
  const password = $local("");
  const errorMsg = $local("");
  const loading = $local(false);

  async function handleLogin(e) {
    if (e) e.preventDefault();
    errorMsg.set("");
    loading.set(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.get(), password: password.get() }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        errorMsg.set(data.error || "Login failed");
      }
    } catch (err) {
      errorMsg.set("Network error. Please try again.");
    } finally {
      loading.set(false);
    }
  }
</Client>

<View>
  <div class="min-h-screen flex items-center justify-center">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-extrabold text-foreground mb-2">Welcome back</h1>
        <p class="text-neutral-500 text-sm">Sign in to your account to continue</p>
      </div>
      <form class="bg-bg-secondary border border-border rounded-2xl p-8 shadow-sm flex flex-col gap-5" @submit="handleLogin(event)">
        <When condition="errorMsg">
          <div class="px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm font-medium">
            {{ errorMsg }}
          </div>
        </When>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Email</label>
          <input
            type="email"
            :value="email"
            @input="email.set(event.target.value)"
            placeholder="you@example.com"
            class="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-foreground placeholder-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm transition-all"
            required
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Password</label>
          <input
            type="password"
            :value="password"
            @input="password.set(event.target.value)"
            placeholder="••••••••"
            class="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-foreground placeholder-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm transition-all"
            required
          />
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm cursor-pointer shadow-md transition-all duration-200"
        >
          Sign In
        </button>
        <p class="text-center text-sm text-neutral-500">
          Don't have an account? <a href="/signup" class="text-primary-500 font-semibold hover:underline">Sign up</a>
        </p>
      </form>
    </div>
  </div>
</View>
`
      );

      // ── Signup page
      fs.mkdirSync(path.join(targetDir, "src/view/signup"), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, "src/view/signup/page.kal"),
        `<Server>
  import { $currentUser } from "@kallojs/server";
  $page(async (ctx) => {
    const user = $currentUser(ctx);
    if (user) {
      ctx.res.redirect("/");
      return {};
    }
    return {};
  });
</Server>

<Client>
  import { $local } from "@kallojs/runtime";

  const name = $local("");
  const email = $local("");
  const password = $local("");
  const errorMsg = $local("");
  const loading = $local(false);

  async function handleSignup(e) {
    if (e) e.preventDefault();
    errorMsg.set("");
    loading.set(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.get(), email: email.get(), password: password.get() }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        errorMsg.set(data.error || "Signup failed");
      }
    } catch (err) {
      errorMsg.set("Network error. Please try again.");
    } finally {
      loading.set(false);
    }
  }
</Client>

<View>
  <div class="min-h-screen flex items-center justify-center">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-extrabold text-foreground mb-2">Create an account</h1>
        <p class="text-neutral-500 text-sm">Start tracking your tasks today</p>
      </div>
      <form class="bg-bg-secondary border border-border rounded-2xl p-8 shadow-sm flex flex-col gap-5" @submit="handleSignup(event)">
        <When condition="errorMsg">
          <div class="px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm font-medium">
            {{ errorMsg }}
          </div>
        </When>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Full Name</label>
          <input
            type="text"
            :value="name"
            @input="name.set(event.target.value)"
            placeholder="Jane Doe"
            class="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-foreground placeholder-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm transition-all"
            required
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Email</label>
          <input
            type="email"
            :value="email"
            @input="email.set(event.target.value)"
            placeholder="you@example.com"
            class="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-foreground placeholder-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm transition-all"
            required
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Password</label>
          <input
            type="password"
            :value="password"
            @input="password.set(event.target.value)"
            placeholder="Min. 8 characters"
            class="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-foreground placeholder-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-sm transition-all"
            required
            minlength="8"
          />
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm cursor-pointer shadow-md transition-all duration-200"
        >
          Create Account
        </button>
        <p class="text-center text-sm text-neutral-500">
          Already have an account? <a href="/login" class="text-primary-500 font-semibold hover:underline">Sign in</a>
        </p>
      </form>
    </div>
  </div>
</View>
`
      );

    } else if (template === "saas") {
      writeDefaultLayout();

      fs.writeFileSync(
        path.join(targetDir, "src/stores/user.ts"),
        `import { $store } from "@kallojs/runtime";

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
        `import { $router } from "@kallojs/server";
import { getSubscription } from "./controllers/subscription.controller.js";

const router = $router();

router.get("/", getSubscription);

export default router;
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallojs/server";
import subscriptionRoutes from "./subscription/subscription.api.js";

const router = $router();

router.use("/subscription", subscriptionRoutes);

export default router;
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/view/page.kal"),
        `<Server>
  $page(async () => {
    return {
      title: "Kallo SaaS Platform"
    };
  });
</Server>

<Client>
  import { useUserStore } from "../stores/user.js";
  import { $local } from "@kallojs/runtime";

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
      writeDefaultLayout();

      fs.writeFileSync(
        path.join(targetDir, "src/stores/blog.ts"),
        `import { $store } from "@kallojs/runtime";

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
        `import { $router } from "@kallojs/server";
import { getPosts } from "./controllers/post.controller.js";

const router = $router();

router.get("/", getPosts);

export default router;
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/api/index.ts"),
        `import { $router } from "@kallojs/server";
import postsRoutes from "./posts/posts.api.js";

const router = $router();

router.use("/posts", postsRoutes);

export default router;
`
      );

      fs.writeFileSync(
        path.join(targetDir, "src/view/page.kal"),
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
    }

    // Write Environment Config Files (.env, .env.local, .env.test)
    fs.writeFileSync(
      path.join(targetDir, ".env"),
      `# Main Kallo Environment Variables
KALLO_PUBLIC_API_URL=http://localhost:4000
DATABASE_URL=postgres://user:password@localhost:5432/kallodb
# KALLO_AUTH_SECRET is required for auth — set it in .env.local (never commit the real value)
`
    );

    fs.writeFileSync(
      path.join(targetDir, ".env.local"),
      `# Local overrides for Kallo (DO NOT commit this file)
KALLO_PUBLIC_APP_TITLE=${pkgName} (Local)
# Auth secret — change this to a long, random string in production
KALLO_AUTH_SECRET=change-me-to-a-long-random-secret-in-production
`
    );

    fs.writeFileSync(
      path.join(targetDir, ".env.test"),
      `# Test overrides for Kallo
KALLO_PUBLIC_APP_TITLE=My Kallo Store (Test)
API_SECRET_KEY=test_super_secret_api_key_12345
`
    );

    // Write Public Assets (custom.css, custom.js, favicon.ico, manifest.json, robots.txt, etc.)
    fs.writeFileSync(
      path.join(targetDir, "public/custom.css"),
      `/* Kallo Custom CSS Styles */
body {
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 0;
  background-color: #030303;
  color: #dcdcdc;
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

    // Write manifest.json
    fs.writeFileSync(
      path.join(targetDir, "public/manifest.json"),
      JSON.stringify(
        {
          name: pkgName,
          short_name: pkgName,
          start_url: "/",
          display: "standalone",
          background_color: "#030303",
          theme_color: "#1682df",
          icons: [
            {
              src: "/favicon.ico",
              sizes: "64x64 32x32 24x24 16x16",
              type: "image/x-icon",
            },
          ],
        },
        null,
        2,
      ),
    );

    // Write robots.txt
    fs.writeFileSync(
      path.join(targetDir, "public/robots.txt"),
      `User-agent: *
Allow: /
Sitemap: /sitemap.xml
`
    );

    // Write llms.txt
    fs.writeFileSync(
      path.join(targetDir, "public/llms.txt"),
      `# ${pkgName}

A high-performance fullstack web application built with the Kallo framework.

## Features
- Express-powered server-side rendering
- Tailwind CSS styling
- File-based routing
- Reactive store and local state management
`
    );

    // Write sitemap.xml
    fs.writeFileSync(
      path.join(targetDir, "public/sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
    );

    // Write .gitignore
    fs.writeFileSync(
      path.join(targetDir, ".gitignore"),
      `node_modules
.kallo
.kallo-cache
dist
.env.local
.DS_Store
`
    );

    // Write README.md
    fs.writeFileSync(
      path.join(targetDir, "README.md"),
      `# ${pkgName}

A beautiful, TypeScript-first fullstack application powered by Kallo.

## Getting Started

First, install the dependencies:

\`\`\`bash
${packageManager} install
\`\`\`

Then, run the development server:

\`\`\`bash
${packageManager} dev
\`\`\`

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

## Development

- Edit \`src/view/page.kal\` to update the main page.
- Edit \`src/view/layout.kal\` to update the root layout.
- Edit \`src/components/\` to add new reusable components.
- Edit \`src/stores/\` to manage global state.
- Edit \`src/api/\` to add new Express-friendly API endpoints.

## Developer Note

Creating a project with the \`--empty\` flag is the fastest way for developers working on the open source project to get started quickly:
\`\`\`bash
kallo create my-app --empty
\`\`\`
`
    );

    KalloLogger.info(`Successfully created project ${appName}!`);
    console.log(`\n🎉 Successfully created Kallo project: ${appName}\n`);
    console.log(`To get started:`);
    console.log(`  cd ${appName}`);
    console.log(`  ${packageManager} install`);
    console.log(`  ${packageManager} dev\n`);

    return true;
  } catch (err) {
    KalloLogger.error("Failed to scaffold project: " + String(err));
    return false;
  }
}
