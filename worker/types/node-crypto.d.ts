// node:crypto ships with the worker via the nodejs_compat compatibility flag,
// but @types/node isn't installed. Ambient declaration for just the streaming
// hash surface used by routes/hashbackfill.ts.
declare module "node:crypto" {
  export interface Hash {
    update(data: Uint8Array | string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}
