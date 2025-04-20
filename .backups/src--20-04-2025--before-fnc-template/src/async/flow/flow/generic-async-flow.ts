import { type AsyncFlow } from './async-flow.js';

export type GenericAsyncFlow = AsyncFlow<any, any>;

export type InferAsyncFlowArguments<GAsyncFlow extends GenericAsyncFlow> =
  GAsyncFlow extends AsyncFlow<infer GArguments, any> ? GArguments : never;

export type InferAsyncFlowReturn<GAsyncFlow extends GenericAsyncFlow> =
  GAsyncFlow extends AsyncFlow<any, infer GReturn> ? GReturn : never;
