export interface SourceInspectOptions<GValue> {
  readonly open?: () => void;
  readonly next?: (value: GValue) => void;
  readonly error?: (error: unknown) => void;
  readonly close?: (reason?: unknown) => void;
}
