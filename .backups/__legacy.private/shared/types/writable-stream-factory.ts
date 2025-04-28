export interface WritableStreamFactory<GValue> {
  (signal?: AbortSignal): PromiseLike<WritableStream<GValue>> | WritableStream<GValue>;
}
