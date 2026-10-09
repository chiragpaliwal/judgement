/** Deep copy for plain JSON-safe state. */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
