export interface AuthProvider {
  id: string;
  authorize(
    credentials: Record<string, string>,
  ): Promise<Record<string, unknown> | null>;
}

export interface AuthConfig {
  secret: string;
  cookieName?: string;
  cookieDomain?: string;
  providers: AuthProvider[];
}

export interface KalloPlugin {
  name: string;
  config?: (config: FrameworkConfig) => FrameworkConfig | void;
  transform?: (
    code: string,
    id: string,
  ) => string | { code: string } | void;
  configureServer?: (app: unknown) => void;
}

/**
 * Controls how `<Image>` and generated asset URLs behave. On a static host
 * (GitHub Pages) there is no image-optimization server, so `unoptimized`
 * defaults to `true` whenever `output: "static"`.
 */
export interface ImagesConfig {
  unoptimized?: boolean;
  domains?: string[];
}

/**
 * Fine-grained knobs for the static export (`kallo export`).
 */
export interface StaticExportConfig {
  /** Glob-like allowlist of route paths to export (default: all). */
  include?: string[];
  /** Route paths to skip when exporting (e.g. server-only admin pages). */
  exclude?: string[];
  /** How unknown deep links behave. `spa` writes a 404.html that boots the
   *  client router; `404` writes a plain not-found page. Default `spa`. */
  fallback?: "404" | "spa";
  /** Abort the export when a route uses a server-only feature. Default true. */
  failOnServerFeature?: boolean;
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
  plugins?: KalloPlugin[];

  /**
   * Rendering target.
   * - `"server"` (default): SSR at request time + per-route `$static` ISR.
   * - `"static"`: `kallo export` pre-renders every route to `outDir` as plain
   *   HTML/CSS/JS that can be hosted on any static host (GitHub Pages, S3, CDN).
   */
  output?: "server" | "static";
  /** Output directory for `kallo export`. Default `"out"`. */
  outDir?: string;
  /**
   * URL path the site is served under, e.g. `"/my-repo"` for GitHub project
   * pages served at `user.github.io/my-repo`. Leave empty for root/custom
   * domains. Must start with `/` and have no trailing slash when set.
   */
  basePath?: string;
  /**
   * Prefix for framework/static assets (`/_kallo/...`). Defaults to `basePath`.
   * Set to an absolute origin to serve assets from a CDN.
   */
  assetPrefix?: string;
  /**
   * When `true`, routes are written as `about/index.html` (directory style).
   * When `false` (default), routes are written as `about.html` (flat), matching
   * Next.js's default static export layout — GitHub Pages resolves `/about` to
   * `/about.html` automatically.
   */
  trailingSlash?: boolean;
  export?: StaticExportConfig;
  images?: ImagesConfig;
}

/**
 * A `FrameworkConfig` after defaults have been resolved by the config loader.
 * Fields the exporter relies on are guaranteed present.
 */
export interface ResolvedKalloConfig extends FrameworkConfig {
  output: "server" | "static";
  outDir: string;
  basePath: string;
  assetPrefix: string;
  trailingSlash: boolean;
  export: Required<StaticExportConfig>;
  images: Required<ImagesConfig>;
}

export interface KalloASTNode {
  type: "Server" | "Client" | "View" | "Style" | "Text" | "Element" | "Head";
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
