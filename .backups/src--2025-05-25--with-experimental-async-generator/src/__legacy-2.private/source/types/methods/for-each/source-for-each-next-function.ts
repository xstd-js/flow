export interface SourceForEachNextFunction<GValue> {
  (value: GValue, signal?: AbortSignal): PromiseLike<void> | void;
}
