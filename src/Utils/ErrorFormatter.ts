/**
 * Formats an unknown thrown value into a readable message, unwrapping nested causes.
 * @param {unknown} error The thrown value
 * @returns {string} A readable description of the error
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.cause === undefined) return error.message;
    const cause = describeError(error.cause);
    // the message may already contain the cause if it was built with describeError when rethrowing
    return error.message.includes(cause) ? error.message : `${error.message} - ${cause}`;
  }
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  return "unknown error";
}
