/** Reject typoed security options instead of silently falling back to public access. */
export function checkOptions(value: unknown, allowed?: readonly string[]): void {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || (allowed && !allowed.includes(key)),
    )
  )
    throw new Error("invalid configuration shape");
}
