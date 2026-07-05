export function formatGpa(n: number, maxDecimals = 3): string {
  return n.toFixed(maxDecimals).replace(/\.?0+$/, "");
}
