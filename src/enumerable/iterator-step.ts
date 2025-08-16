export interface IteratorNextStep<GValue> {
  readonly type: 'next';
  readonly value: GValue;
}

export interface IteratorErrorStep {
  readonly type: 'error';
  readonly error: unknown;
}

export interface IteratorCompleteStep {
  readonly type: 'complete';
}

export type IteratorStep<GValue> =
  | IteratorNextStep<GValue>
  | IteratorErrorStep
  | IteratorCompleteStep;
