import { type MapFunction } from '@xstd/functional';
import { type Flow } from '../flow/flow.js';

/**
 * A function to _drain_ (consume) a `Flow`.
 */
export interface DrainFlow<
  GValue,
  GReturn = void,
  GFlowArguments extends readonly unknown[] = [],
  GDrainArguments extends readonly unknown[] = GFlowArguments,
> {
  (
    flow: Flow<GValue, GFlowArguments>,
    signal: AbortSignal,
    ...args: GDrainArguments
  ): PromiseLike<GReturn> | GReturn;
}

/**
 * Represents a _consumer_ of a `Flow`.
 *
 * @template GValue - Type of the values sent by the readable flow.
 * @template GReturn - Return type of the drain method after the consumption of the flow.
 * @template GFlowArguments - Additional arguments passed to the readable flow.
 * @template GDrainArguments - Additional arguments passed to the drain function.
 */
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

  /**
   * Consumes a `Flow` and returns a `Promise` that resolves to the return value of the drain function.
   *
   * @param flow - The readable flow to consume.
   * @param signal - The signal to abort the process.
   * @param args - Additional arguments passed to the drain function.
   * @returns A `Promise` that resolves to the return value of the drain function.
   */
  async drain(
    flow: Flow<GValue, GFlowArguments>,
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
