import { type ReadableFlow } from '../../../readable-flow.js';

export type ReadableFlowCombineRecordResult<
  GRecord extends Record<string, ReadableFlow<any, GArguments>>,
  GArguments extends readonly unknown[],
> = {
  [GKey in keyof GRecord]: GRecord[GKey] extends ReadableFlow<infer GValue, GArguments>
    ? GValue
    : never;
};
