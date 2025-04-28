import { type AsyncFlowFactoryInspectOptions } from '../../../../flow/factory/types/methods/async-flow-factory-inspect-options.js';
import { type AsyncReader } from '../../../reader/async-reader.js';

export interface AsyncReadableInspectOptions<GValue>
  extends Omit<AsyncFlowFactoryInspectOptions<AsyncReader<GValue>>, 'emit' | 'receive'> {
  readonly next?: (value: GValue) => void;
  // readonly open?: () => void;
  // readonly next?: (value: GValue) => void;
  // readonly error?: (error: unknown) => void;
  // readonly abort?: (reason?: unknown) => void;
}
