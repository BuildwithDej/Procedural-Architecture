/** Two decimals when needed, so 4.2 reads as 4.20 m and 1 reads as 1 m. */
export function formatMetres(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
  return `${text} m`;
}

/** Fixed two decimals for the dimension fields. */
export function formatInput(value: number): string {
  return value.toFixed(2);
}
