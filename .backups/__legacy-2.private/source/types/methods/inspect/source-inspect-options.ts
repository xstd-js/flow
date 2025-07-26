import { type FlowError } from '../../../../shared/flow-error.js';

export interface SourceInspectOptions<GValue> {
  readonly open?: () => void;
  readonly next?: (value: GValue) => void;
  readonly error?: (error: FlowError) => void;
  readonly close?: (reason?: unknown) => void;
}
