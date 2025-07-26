export interface SourceForEachFunction<GValue> {
  (value: GValue, signal?: AbortSignal): PromiseLike<void> | void;
}
