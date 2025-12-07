export interface FlowFinallyFunction {
  (signal: AbortSignal): PromiseLike<void> | void;
}
