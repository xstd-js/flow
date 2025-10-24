export interface ReadableFlowFinallyFunction {
  (signal: AbortSignal): PromiseLike<void> | void;
}
