// The single list of words and phrases that must not reach users.
export const BANNED: readonly string[] = [
  "safe route",
  "safest",
  "guaranteed",
  "secure",
  "dangerous area",
  "bad neighborhood",
];

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** Returns the banned entries found as whole-token runs in the text. */
export function findBanned(text: string): string[] {
  const words = tokens(text);
  const found: string[] = [];
  for (const entry of BANNED) {
    const run = tokens(entry);
    for (let i = 0; i + run.length <= words.length; i++) {
      if (run.every((t, j) => words[i + j] === t)) {
        found.push(entry);
        break;
      }
    }
  }
  return found;
}
