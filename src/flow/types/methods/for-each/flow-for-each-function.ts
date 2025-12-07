export interface FlowForEachFunction<GValue> {
  (value: GValue, signal: AbortSignal): PromiseLike<void> | void;
}
