declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:path" {
  const path: {
    dirname(value: string): string;
    join(...parts: string[]): string;
    relative(from: string, to: string): string;
  };

  export default path;
}

declare const process: {
  cwd(): string;
};
