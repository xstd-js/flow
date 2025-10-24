import { type MapFunction } from '@xstd/functional';
import { type ReadableFlow } from '../flow/readable/readable-flow.js';

export interface DrainFlow<
  GValue,
  GReturn = void,
  GFlowArguments extends readonly unknown[] = [],
  GDrainArguments extends readonly unknown[] = GFlowArguments,
> {
  (
    flow: ReadableFlow<GValue, GFlowArguments>,
    signal: AbortSignal,
    ...args: GDrainArguments
  ): PromiseLike<GReturn> | GReturn;
}

export class Drain<
  GValue,
  GReturn = void,
  GFlowArguments extends readonly unknown[] = [],
  GDrainArguments extends readonly unknown[] = [],
> {
  readonly #drain: DrainFlow<GValue, GReturn, GFlowArguments, GDrainArguments>;

  constructor(drain: DrainFlow<GValue, GReturn, GFlowArguments, GDrainArguments>) {
    this.#drain = drain;
  }

  async drain(
    flow: ReadableFlow<GValue, GFlowArguments>,
    signal: AbortSignal,
    ...args: GDrainArguments
  ): Promise<GReturn> {
    return this.#drain(flow, signal, ...args);
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }
}
