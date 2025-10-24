export interface ReadableFlowFromPromiseFactoryFunction<
  GValue,
  GArguments extends readonly unknown[],
> {
  (signal: AbortSignal, ...args: GArguments): PromiseLike<GValue> | GValue;
}
