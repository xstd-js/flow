import { type ReadableFlowContext } from './readable-flow-context.js';
import { type ReadableFlowIterator } from './readable-flow-iterator.js';

export interface ReadableFlowFactory<GValue, GArguments extends readonly unknown[]> {
  (ctx: ReadableFlowContext, ...args: GArguments): ReadableFlowIterator<GValue>;
}
