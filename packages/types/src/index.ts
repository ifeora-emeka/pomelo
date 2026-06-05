export interface AuthProvider {
  id: string;
  authorize(credentials: Record<string, string>): Promise<any | null>;
}

export interface AuthConfig {
  secret: string;
  cookieName?: string;
  cookieDomain?: string;
  providers: AuthProvider[];
}

export interface FrameworkConfig {
  name: string;
  version: string;
  port: number;
  env?: "development" | "production" | "test";
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
    methods?: string[];
  };
  auth?: AuthConfig;
}

export interface KalloASTNode {
  type: "Server" | "Client" | "View" | "Style" | "Text" | "Element";
  content: string;
  tagName?: string;
  attributes?: Record<string, string>;
  children?: KalloASTNode[];
}

export interface KalloAST {
  type: "Root";
  children: KalloASTNode[];
}

export interface CompilerOptions {
  minify?: boolean;
  scoped?: boolean;
  sourceMap?: boolean;
}

export interface CompilerResult {
  code: string;
  css?: string;
  map?: string;
}

export interface ReactiveState<T> {
  value: T;
  get(): T;
  set(newValue: T): void;
}

export interface CLIContext {
  command: string;
  args: string[];
}

export interface RouteRecord {
  path: string;
  filePath: string;
  isDynamic: boolean;
  isCatchAll: boolean;
  paramNames: string[];
  layoutPaths: string[];
  children: RouteRecord[];
  depth: number;
}

export interface RouteManifest {
  routes: RouteRecord[];
  layouts: Map<string, string>;
}

export interface StoreOptions {
  persist?: boolean;
  persistKey?: string;
}

export interface PersistAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface Metadata {
  title?: string;
  description?: string;
  charset?: string;
  viewport?: string;
  canonical?: string;
  robots?: string;
  openGraph?: {
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    image?: string;
    siteName?: string;
  };
  twitter?: {
    card?: "summary" | "summary_large_image" | "app" | "player";
    site?: string;
    creator?: string;
    title?: string;
    description?: string;
    image?: string;
  };
  meta?: Array<{ name?: string; property?: string; content: string }>;
  links?: Array<{ rel: string; href: string; [key: string]: string }>;
}
