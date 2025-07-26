export interface FlowInspectOptions<GValue> {
  readonly open?: () => void;
  readonly next?: (value: GValue) => void;
  readonly error?: (error: unknown) => void;
  readonly close?: () => void;
}
