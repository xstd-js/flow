export interface FlowMapArgumentsFunction<
  GNewArguments extends readonly unknown[],
  GArguments extends readonly unknown[],
> {
  (...args: GNewArguments): GArguments;
}
