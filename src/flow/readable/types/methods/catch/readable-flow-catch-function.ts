import { type ReadableFlow } from '../../../readable-flow.js';

export interface ReadableFlowCatchFunction<GOut> {
  (error: unknown): ReadableFlow<GOut, []>;
}
