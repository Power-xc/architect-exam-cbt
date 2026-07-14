/**
 * Fisher-Yates shuffle. Returns a new array; the input is left untouched.
 *
 * Used instead of `array.sort(() => Math.random() - 0.5)`, which is biased
 * and produces non-uniform orderings on most engines.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
