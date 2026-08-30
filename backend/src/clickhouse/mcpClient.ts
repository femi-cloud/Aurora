export function toSafeInt(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid integer parameter: ${value}`);
  }
  return n;
}

export function toSafeFloat(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid float parameter: ${value}`);
  }
  return n;
}