/** Builds a regular Error, tagged with a custom `.name` and any extra own
 * properties. The single place every app-specific error gets created —
 * no per-error-type classes. */
export const createError = <T extends object = object>(
  name: string,
  message: string,
  props?: T,
): Error & T => {
  const err = new Error(message);
  err.name = name;
  return Object.assign(err, props) as Error & T;
};

/** Narrows `unknown` by the `.name` tag createError() set. */
export const isError = (err: unknown, name: string): err is Error => {
  return err instanceof Error && err.name === name;
};

/**
 * Shared across every parse-and-repair service (receipts, expenses, …) — the
 * repair loop is exhausted and no valid structured output could be produced.
 * `message` is caller-supplied and already user-safe (never raw model
 * internals), so middleware/error.ts can surface it directly.
 */
export const invalidOutputError = (message: string) =>
  createError("InvalidModelOutputError", message);
export const isInvalidOutputError = (err: unknown): err is Error =>
  isError(err, "InvalidModelOutputError");
