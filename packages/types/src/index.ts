export interface FrameworkConfig {
  name: string;
  version: string;
  port: number;
}

export interface PomeloAST {
  type: string;
  content: string;
}
