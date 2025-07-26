export function isPromiseLike<GValue>(input: unknown): input is PromiseLike<GValue> {
  return (
    input !== null && typeof input === 'object' && typeof (input as any)['then'] === 'function'
  );
}
