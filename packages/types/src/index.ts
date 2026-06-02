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
