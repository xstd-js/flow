import { type ReadableFlowContext } from './readable-flow-context.js';
import { type ReadableFlowIterator } from './readable-flow-iterator.js';

/**
 * The function to provide to a readable flow.
 */
export interface ReadableFlowFactory<GValue, GArguments extends readonly unknown[]> {
  (ctx: ReadableFlowContext, ...args: GArguments): ReadableFlowIterator<GValue>;
}
