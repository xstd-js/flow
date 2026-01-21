import { type FlowMapArgumentsFunction } from '../flow-map-arguments-function.ts';

/**
 * Used to set the arguments of a Flow.
 *
 * @param args - The arguments to set.
 * @returns {FlowMapArgumentsFunction<[], GArguments>} - A function that maps no arguments to a list of predefined ones.
 *
 * @example
 *
 * ```ts
 * const reader = flow.mapArguments(setArguments(10)).open(signal);
 * ``
 */
export function setArguments<GArguments extends readonly unknown[]>(
  ...args: GArguments
): FlowMapArgumentsFunction<[], GArguments> {
  return (): GArguments => args;
}
