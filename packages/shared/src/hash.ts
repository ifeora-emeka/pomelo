// Deterministic, dependency-free string hash (FNV-1a) used for component ids
// and content hashes. Not cryptographic — only needs good-enough distribution
// to avoid collisions between component file paths.
export function hashId(input: string, length = 6): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(length, "0").slice(0, length);
}
