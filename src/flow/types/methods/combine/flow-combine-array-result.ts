import { type Flow } from '../../../flow.js';

export type FlowCombineArrayResult<
  GArray extends ArrayLike<Flow<any, GArguments>>,
  GArguments extends readonly unknown[],
> = Pick<GArray, Exclude<keyof GArray, number>> & {
  [GKey in Extract<keyof GArray, number>]: GArray[GKey] extends Flow<
    infer GValue,
    GArguments
  >
    ? GValue
    : never;
};
