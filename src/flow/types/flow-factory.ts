import { type FlowContext } from './flow-context.ts';
import { type FlowIterator } from './flow-iterator.ts';

/**
 * The function to provide to a Flow.
 */
export interface FlowFactory<GValue, GArguments extends readonly unknown[]> {
  (ctx: FlowContext, ...args: GArguments): FlowIterator<GValue>;
}
