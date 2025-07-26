import { type ReadableFlow } from '../../../../flow/readable/readable-flow.js';

export interface DrainTransformFunction<GIn, GOut> {
  (flow: ReadableFlow<GIn>): ReadableFlow<GOut>;
}
