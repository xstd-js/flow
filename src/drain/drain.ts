import { type MapFunction } from '@xstd/functional';
import { ReadableFlow } from '../flow/readable/readable-flow.js';
import { type ReadableFlowSource } from '../flow/readable/types/readable-flow-source.js';

export interface DrainFlow<GValue, GArguments extends readonly unknown[]> {
  (
    flow: ReadableFlow<GValue, []>,
    signal: AbortSignal,
    ...args: GArguments
  ): PromiseLike<void> | void;
}

export class Drain<GValue, GArguments extends readonly unknown[] = []> {
  readonly #drain: DrainFlow<GValue, GArguments>;

  constructor(drain: DrainFlow<GValue, GArguments>) {
    this.#drain = drain;
  }

  async drain(
    flow: ReadableFlowSource<GValue>,
    signal: AbortSignal,
    ...args: GArguments
  ): Promise<void> {
    await this.#drain(ReadableFlow.from<GValue>(flow), signal, ...args);
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }
}
