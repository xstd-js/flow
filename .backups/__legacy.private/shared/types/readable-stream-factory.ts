export interface ReadableStreamFactory<GValue> {
  (signal?: AbortSignal): PromiseLike<ReadableStream<GValue>> | ReadableStream<GValue>;
}
