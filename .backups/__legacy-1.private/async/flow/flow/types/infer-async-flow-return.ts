import { type AsyncFlow } from '../async-flow.js';
import { type GenericAsyncFlow } from './generic-async-flow.js';

export type InferAsyncFlowReturn<GAsyncFlow extends GenericAsyncFlow> =
  GAsyncFlow extends AsyncFlow<any, infer GReturn> ? GReturn : never;
