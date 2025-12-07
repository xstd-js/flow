import { type FlowContext } from './flow-context.js';
import { type FlowIterator } from './flow-iterator.js';

/**
 * The function to provide to a Flow.
 */
export interface FlowFactory<GValue, GArguments extends readonly unknown[]> {
  (ctx: FlowContext, ...args: GArguments): FlowIterator<GValue>;
}
