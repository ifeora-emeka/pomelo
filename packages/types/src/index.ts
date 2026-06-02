export interface FrameworkConfig {
  name: string;
  version: string;
  port: number;
  env?: "development" | "production" | "test";
}

export interface PomeloASTNode {
  type: "Server" | "Client" | "View" | "Style" | "Text" | "Element";
  content: string;
  tagName?: string;
  attributes?: Record<string, string>;
  children?: PomeloASTNode[];
}

export interface PomeloAST {
  type: "Root";
  children: PomeloASTNode[];
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
