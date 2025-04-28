import { type GenericAsyncFlow } from '../../../flow/types/generic-async-flow.js';
import { type InferAsyncFlowArguments } from '../../../flow/types/infer-async-flow-arguments.js';
import { type InferAsyncFlowReturn } from '../../../flow/types/infer-async-flow-return.js';

export interface AsyncFlowFactoryInspectOptions<GAsyncFlow extends GenericAsyncFlow> {
  readonly open?: () => void;
  readonly emit?: (...args: InferAsyncFlowArguments<GAsyncFlow>) => void;
  readonly receive?: (result: InferAsyncFlowReturn<GAsyncFlow>) => void;
  readonly error?: (error: unknown) => void;
  readonly abort?: (reason?: unknown) => void;
}
