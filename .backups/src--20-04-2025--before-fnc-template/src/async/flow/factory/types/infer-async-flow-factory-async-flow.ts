import { type AsyncFlowFactory } from '../async-flow-factory.js';
import { type GenericAsyncFlowFactory } from './generic-async-flow-factory.js';

export type InferAsyncFlowFactoryAsyncFlow<GAsyncFlowFactory extends GenericAsyncFlowFactory> =
  GAsyncFlowFactory extends AsyncFlowFactory<infer GAsyncFlow> ? GAsyncFlow : never;
