import { type MapFunction } from '@xstd/functional';
import { type ReadableFlow } from '../flow/readable/readable-flow.js';

export interface DrainFlow<
  GValue,
  GFlowArguments extends readonly unknown[] = [],
  GDrainArguments extends readonly unknown[] = GFlowArguments,
> {
  (
    flow: ReadableFlow<GValue, GFlowArguments>,
    signal: AbortSignal,
    ...args: GDrainArguments
  ): PromiseLike<void> | void;
}

export class Drain<
  GValue,
  GFlowArguments extends readonly unknown[] = [],
  GDrainArguments extends readonly unknown[] = [],
> {
  readonly #drain: DrainFlow<GValue, GFlowArguments, GDrainArguments>;

  constructor(drain: DrainFlow<GValue, GFlowArguments, GDrainArguments>) {
    this.#drain = drain;
  }

  async drain(
    flow: ReadableFlow<GValue, GFlowArguments>,
    signal: AbortSignal,
    ...args: GDrainArguments
  ): Promise<void> {
    await this.#drain(flow, signal, ...args);
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }
}
