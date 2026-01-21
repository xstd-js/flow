import { type MapFunction } from '@xstd/functional';
import { type FlowMapArgumentsFunction } from '../flow-map-arguments-function.ts';

/**
 * Used to map the first argument of a Flow to another one.
 *
 * @template GSource - The type of the source argument.
 * @template GDestination - The type of the destination argument.
 * @param {MapFunction<GSource, GDestination>} mapFnc - The function to map the source argument to the destination one.
 * @returns {FlowMapArgumentsFunction<[GSource], [GDestination]>} - A function that maps one argument to another one.
 *
 * @example
 *
 * ```ts
 * const reader = flow.mapArguments(mapOneArgument(Number)).open(signal, '10');
 * ``
 */
export function mapOneArgument<GSource, GDestination>(
  mapFnc: MapFunction<GSource, GDestination>,
): FlowMapArgumentsFunction<[GSource], [GDestination]> {
  return (arg: GSource): [GDestination] => [mapFnc(arg)];
}
