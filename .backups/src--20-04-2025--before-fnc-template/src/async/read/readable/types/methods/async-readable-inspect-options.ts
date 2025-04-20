export interface AsyncReadableInspectOptions<GValue> {
  readonly open?: () => void;
  readonly next?: (value: GValue) => void;
  readonly error?: (error: unknown) => void;
  readonly abort?: (reason?: unknown) => void;
}
