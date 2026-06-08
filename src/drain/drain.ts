import { type MapFunction } from '@xstd/functional';
import { type Flow } from '../flow/flow.ts';

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

export interface DrainWritableStreamFactory<
  GValue,
  GReturn,
  GFlowArguments extends readonly unknown[],
  GDrainArguments extends readonly unknown[],
> {
  (...args: GDrainArguments): DrainWritableStreamFactoryResult<GValue, GReturn, GFlowArguments>;
}

export interface DrainWritableStreamFactoryResult<
  GValue,
  GReturn,
  GFlowArguments extends readonly unknown[],
> {
  readonly stream: WritableStream<GValue>;
  readonly flowArguments: GFlowArguments;
  readonly complete: () => PromiseLike<GReturn> | GReturn;
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
  /**
   * Creates a `Drain` instance from a writable stream factory.
   *
   * @experimental
   * @template GValue - The type of values written to the writable stream.
   * @template GReturn - The return type of the drain operation.
   * @template GFlowArguments - The type of arguments passed to the flow during the drain operation.
   * @template GDrainArguments - The type of arguments expected by the writable stream factory.
   * @param {DrainWritableStreamFactory<GValue, GReturn, GFlowArguments, GDrainArguments>} factory - A factory function that produces a writable stream, flow arguments, and a completion handler.
   * @returns {Drain<GValue, GReturn, GFlowArguments, GDrainArguments>} A `Drain` instance configured to use the provided writable stream factory.
   */
  static fromWritableStreamFactory<
    GValue,
    GReturn = void,
    GFlowArguments extends readonly unknown[] = [],
    GDrainArguments extends readonly unknown[] = [],
  >(
    factory: DrainWritableStreamFactory<GValue, GReturn, GFlowArguments, GDrainArguments>,
  ): Drain<GValue, GReturn, GFlowArguments, GDrainArguments> {
    return new Drain<GValue, GReturn, GFlowArguments, GDrainArguments>(
      async (
        flow: Flow<GValue, GFlowArguments>,
        signal: AbortSignal,
        ...args: GDrainArguments
      ): Promise<GReturn> => {
        await using stack: AsyncDisposableStack = new AsyncDisposableStack();

        const { stream, flowArguments, complete } = factory(...args);

        stack.defer((): Promise<void> => {
          return signal.aborted ? stream.abort(signal.reason) : stream.close();
        });

        const writer: WritableStreamDefaultWriter<GValue> = stack.adopt(
          stream.getWriter(),
          (writer: WritableStreamDefaultWriter<GValue>): void => writer.releaseLock(),
        );

        for await (const value of flow.open(signal, ...flowArguments)) {
          await writer.write(value);
        }

        return await complete();
      },
    );
  }

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

  transformFlow<GNewValue, GNewFlowArguments extends readonly unknown[] = GFlowArguments>(
    transformFnc: MapFunction<Flow<GNewValue, GNewFlowArguments>, Flow<GValue, GFlowArguments>>,
  ): Drain<GNewValue, GReturn, GNewFlowArguments, GDrainArguments> {
    return new Drain<GNewValue, GReturn, GNewFlowArguments, GDrainArguments>(
      (
        flow: Flow<GNewValue, GNewFlowArguments>,
        signal: AbortSignal,
        ...args: GDrainArguments
      ): PromiseLike<GReturn> | GReturn => {
        return this.#drain(transformFnc(flow), signal, ...args);
      },
    );
  }
}
