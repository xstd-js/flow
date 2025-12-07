export interface FlowInspectOptions<GValue, GArguments extends readonly unknown[]> {
  readonly open?: (...args: GArguments) => void;
  readonly next?: (value: GValue) => void;
  readonly error?: (error: unknown) => void;
  readonly close?: () => void;
}
