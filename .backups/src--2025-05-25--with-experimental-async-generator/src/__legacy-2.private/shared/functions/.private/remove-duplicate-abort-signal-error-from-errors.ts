export function removeDuplicateAbortSignalErrorFromErrors(
  signal: AbortSignal,
  errors: readonly unknown[],
): readonly unknown[] {
  return signal.aborted
    ? [
        signal.reason,
        ...errors.filter((error: unknown): boolean => {
          return error !== signal.reason;
        }),
      ]
    : errors;
}
