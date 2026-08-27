/** Shared display formatting for usage/cost components (non-negative, en-US). */

export function formatUsd(n: number): string {
  return `$${Math.max(0, n).toFixed(2)}`;
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(n)));
}
