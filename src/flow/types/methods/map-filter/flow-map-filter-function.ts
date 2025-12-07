import { type None } from '@xstd/none';

/**
 * @deprecated
 */
export interface FlowMapFilterFunction<GIn, GOut, GArguments extends readonly unknown[]> {
  (value: GIn, args: GArguments, retry: number): PromiseLike<GOut | None> | GOut | None;
}
