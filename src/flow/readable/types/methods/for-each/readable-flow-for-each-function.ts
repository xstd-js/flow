export interface ReadableFlowForEachFunction<GValue> {
  (value: GValue, signal: AbortSignal): PromiseLike<void> | void;
}
