import { type ReadableFlow } from '../../../readable-flow.js';

export type ReadableFlowCombineArrayResult<
  GArray extends ArrayLike<ReadableFlow<any, GArguments>>,
  GArguments extends readonly unknown[],
> = Pick<GArray, Exclude<keyof GArray, number>> & {
  [GKey in Extract<keyof GArray, number>]: GArray[GKey] extends ReadableFlow<
    infer GValue,
    GArguments
  >
    ? GValue
    : never;
};
