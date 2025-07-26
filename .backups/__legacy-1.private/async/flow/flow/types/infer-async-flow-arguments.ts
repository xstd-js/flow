import { type AsyncFlow } from '../async-flow.js';
import { type GenericAsyncFlow } from './generic-async-flow.js';

export type InferAsyncFlowArguments<GAsyncFlow extends GenericAsyncFlow> =
  GAsyncFlow extends AsyncFlow<infer GArguments, any> ? GArguments : never;
