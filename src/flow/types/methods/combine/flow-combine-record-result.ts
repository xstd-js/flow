import { type Flow } from '../../../flow.ts';

export type FlowCombineRecordResult<
  GRecord extends Record<string, Flow<any, GArguments>>,
  GArguments extends readonly unknown[],
> = {
  [GKey in keyof GRecord]: GRecord[GKey] extends Flow<infer GValue, GArguments> ? GValue : never;
};
