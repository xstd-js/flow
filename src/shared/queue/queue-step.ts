export interface QueueNextStep<GValue> {
  readonly type: 'next';
  readonly value: GValue;
}

export interface QueueErrorStep {
  readonly type: 'error';
  readonly error: unknown;
}

export interface QueueCompleteStep {
  readonly type: 'complete';
}

export type QueueStep<GValue> = QueueNextStep<GValue> | QueueErrorStep | QueueCompleteStep;
