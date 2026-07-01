/** Single-quote a string for safe interpolation into /bin/sh commands. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
