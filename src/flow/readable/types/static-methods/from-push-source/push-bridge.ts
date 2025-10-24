export interface PushBridge<GValue> {
  readonly next: PushBridgeNextFunction<GValue>;
  readonly error: PushBridgeErrorFunction;
  readonly complete: PushBridgeCompleteFunction;
  readonly signal: AbortSignal;
  readonly stack: AsyncDisposableStack;
}

export interface PushBridgeNextFunction<GValue> {
  (value: GValue): void;
}

export interface PushBridgeErrorFunction {
  (error?: unknown): void;
}

export interface PushBridgeCompleteFunction {
  (): void;
}
