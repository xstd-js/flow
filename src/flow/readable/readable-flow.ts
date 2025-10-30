import { abortify } from '@xstd/abortable';
import { type AsyncEnumeratorObject, type EnumeratorResult } from '@xstd/enumerable';
import { EQUAL_FUNCTION_STRICT_EQUAL } from '@xstd/equal-function';
import {
  type FilterFunction,
  type FilterFunctionWithSubType,
  type MapFilterFunction,
  type MapFunction,
  type ReduceFunction,
} from '@xstd/functional';
import { type None, NONE } from '@xstd/none';
import { Flow } from '../flow/flow.js';
import { type FlowReader } from './types/flow-reader.js';
import { type ReadableFlowCatchFunction } from './types/methods/catch/readable-flow-catch-function.js';
import { type ReadableFlowCombineArrayResult } from './types/methods/combine/readable-flow-combine-array-result.js';
import { type ReadableFlowCombineRecordResult } from './types/methods/combine/readable-flow-combine-record-result.js';
import { type ReadableFlowDistinctOptions } from './types/methods/distinct/readable-flow-distinct-options.js';
import { type ReadableFlowFinallyFunction } from './types/methods/finally/readable-flow-finally-function.js';
import { type ReadableFlowFlatMapFunction } from './types/methods/flat-map/readable-flow-flat-map-function.js';
import { type ReadableFlowForEachFunction } from './types/methods/for-each/readable-flow-for-each-function.js';
import { type ReadableFlowForkOptions } from './types/methods/fork/readable-flow-fork-options.js';
import { type ReadableFlowInspectOptions } from './types/methods/inspect/readable-flow-inspect-options.js';
import { type ReadableFlowContext } from './types/readable-flow-context.js';
import { type ReadableFlowIterator } from './types/readable-flow-iterator.js';
import { type ReadableFlowFromPromiseFactoryFunction } from './types/static-methods/from-promise-factory/readable-flow-from-promise-factory-function.js';
import { type InitPushSource } from './types/static-methods/from-push-source/init-push-source.js';
import { type PushBridge } from './types/static-methods/from-push-source/push-bridge.js';
import { type PushToPullOptions } from './types/static-methods/from-push-source/push-to-pull-options.js';
import { type QueueStep } from './types/static-methods/from-push-source/queue-step.js';

/**
 * Represents a readable flow of values that can be consumed asynchronously.
 *
 * @template GValue The type of values emitted by the flow.
 * @template GArguments Additional arguments to pass to the flow.
 * @extends {Flow<void, GValue, void, GArguments>}
 */
export class ReadableFlow<GValue, GArguments extends readonly unknown[] = []> extends Flow<
  void,
  GValue,
  void,
  GArguments
> {
  /* PUSH TO PULL */

  /**
   * Creates a `ReadableFlow` from a push-based data source.
   *
   * @param {InitPushSource<GValue>} init - A function to initialize the push-based data source. The function receives a controller object that includes methods for pushing the next value, signaling an error, or completing the stream, as well as an `AbortSignal` for handling cancellations.
   * @return {ReadableFlow<GValue, [options?: PushToPullOptions]>} A `ReadableFlow` that converts the push-based data source into a pull-based stream.
   */
  static fromPushSource<GValue>(
    init: InitPushSource<GValue>,
  ): ReadableFlow<GValue, [options?: PushToPullOptions]> {
    return new ReadableFlow<GValue, [options?: PushToPullOptions]>(async function* (
      { signal }: ReadableFlowContext,
      { dataRetentionTime = 0 }: PushToPullOptions = {},
    ): ReadableFlowIterator<GValue> {
      signal.throwIfAborted();

      // 1) create push/pull queue
      let push: (step: QueueStep<GValue>) => void;
      let pull: (signal: AbortSignal) => Promise<QueueStep<GValue>>;

      if (dataRetentionTime <= 0) {
        let queueStepPromise: PromiseWithResolvers<QueueStep<GValue>> | undefined;

        push = (step: QueueStep<GValue>): void => {
          if (queueStepPromise !== undefined) {
            queueStepPromise.resolve(step);
            queueStepPromise = undefined;
          }
        };

        pull = async (signal: AbortSignal): Promise<QueueStep<GValue>> => {
          // NOTE: never happens, because `pull`s are not concurrent
          // if (queueStepPromise === undefined) {
          queueStepPromise = Promise.withResolvers<QueueStep<GValue>>();
          // }

          return await abortify(queueStepPromise.promise, {
            signal,
          });
        };
      } else {
        interface Entry<GValue> {
          readonly step: QueueStep<GValue>;
          readonly expirationDate: number;
        }

        const queue: Entry<GValue>[] = [];

        let queueStepPromise: PromiseWithResolvers<void> | undefined;

        const removeExpiredEntries = (): void => {
          const now: number = Date.now();
          while (queue.length > 0 && queue[0].expirationDate < now) {
            queue.shift();
          }
        };

        push = (step: QueueStep<GValue>): void => {
          queue.push({
            step,
            expirationDate: Date.now() + dataRetentionTime,
          });

          removeExpiredEntries();

          if (queueStepPromise !== undefined) {
            queueStepPromise.resolve();
            queueStepPromise = undefined;
          }
        };

        pull = async (signal: AbortSignal): Promise<QueueStep<GValue>> => {
          while (true) {
            removeExpiredEntries();

            if (queue.length === 0) {
              // NOTE: never happens, because `pull`s are not concurrent
              // if (queueStepPromise === undefined) {
              queueStepPromise = Promise.withResolvers<void>();
              // }

              await abortify(queueStepPromise.promise, {
                signal,
              });
            } else {
              return queue.shift()!.step;
            }
          }
        };
      }

      // 2) create bridge

      // 2.1) create bridge push controller
      const bridgeController: AbortController = new AbortController();
      const bridgeSignal: AbortSignal = AbortSignal.any([bridgeController.signal, signal]);

      const pushBridgeStep = (step: QueueStep<GValue>): void => {
        bridgeSignal.throwIfAborted();

        if (step.type === 'error' || step.type === 'complete') {
          bridgeController.abort();
        }

        push(step);
      };

      // 2.2) create bridge pull controller
      const pullBridgeStep = async (): Promise<QueueStep<GValue>> => {
        bridgeSignal.throwIfAborted();

        try {
          const step: QueueStep<GValue> = await pull(signal);

          if (step.type === 'error' || step.type === 'complete') {
            bridgeController.abort();
          }

          return step;
        } catch (error: unknown) {
          bridgeController.abort(error);
          throw error;
        }
      };

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      const result: PromiseLike<void> | void = init({
        next: (value: GValue): void => {
          pushBridgeStep({
            type: 'next',
            value,
          });
        },
        error: (error?: unknown): void => {
          pushBridgeStep({
            type: 'error',
            error,
          });
        },
        complete: (): void => {
          pushBridgeStep({
            type: 'complete',
          });
        },
        signal: bridgeSignal,
        stack,
      });

      // NOTE: ensures that `pull` is called synchronously if `init` is synchronous
      if (result !== undefined) {
        await result;
      }

      // 3) iterate
      while (true) {
        const step: QueueStep<GValue> = await pullBridgeStep();

        if (step.type === 'next') {
          yield step.value;
        } else if (step.type === 'error') {
          throw step.error;
        } else {
          return;
        }
      }
    });
  }

  /**
   * Creates a `ReadableFlow` that listens to a specified event type on a given `EventTarget`.
   *
   * @param {EventTarget} target - The target object to listen for events on.
   * @param {string} type - The type of event to listen for.
   * @return {ReadableFlow<GEvent, [options?: PushToPullOptions]>} A readable flow that emits events of the specified type.
   */
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
  ): ReadableFlow<GEvent, [options?: PushToPullOptions]> {
    return this.fromPushSource<GEvent>(({ next, signal }: PushBridge<GEvent>): void => {
      target.addEventListener(type, next as EventListener, {
        signal,
      });
    });
  }

  /* FROM MANY */

  /**
   * Combines multiple readable flows into a single flow, concatenating their outputs.
   *
   * @param {ReadableFlow<GValue, GArguments>[]} flows - An array of readable flows to be concatenated.
   * @return {ReadableFlow<GValue, GArguments>} A single concatenated readable flow combining all inputs.
   */
  static concat<GValue, GArguments extends readonly unknown[]>(
    ...flows: ReadableFlow<GValue, GArguments>[]
  ): ReadableFlow<GValue, GArguments> {
    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      for (let i: number = 0; i < flows.length; i++) {
        yield* flows[i].use(ctx, ...args);
      }
    });
  }

  // TODO
  // static merge<GValue>(flows: Iterable<Flow<GValue>>): Flow<GValue> {
  //   return new Flow<GValue>(async function* (signal: AbortSignal): FlowIterator<GValue> {
  //     const readers: ActiveFlow<GValue>[] = Array.from(flows, (flow: Flow<GValue>): ActiveFlow<GValue> => {
  //       return flow.open(signal);
  //     });
  //
  //     for (const flow of flows) {
  //       yield* flow.open(signal);
  //     }
  //   });
  // }

  /**
   * Combines multiple readable flows into a single flow that produces an array of the latest values emitted from each flow.
   *
   * @param {GArray} array - An array-like object containing readable flows to be combined.
   * @return {ReadableFlow<ReadableFlowCombineArrayResult<GArray, GArguments>, GArguments>} A readable flow that outputs an array with the most recent values emitted by the input flows.
   */
  static combine<
    GArray extends ArrayLike<ReadableFlow<any, GArguments>>,
    GArguments extends readonly unknown[],
  >(array: GArray): ReadableFlow<ReadableFlowCombineArrayResult<GArray, GArguments>, GArguments>;
  /**
   * Combines multiple readable flows into a single flow that produces a record of the latest values emitted from each flow.
   *
   * @param {GRecord} record - A record containing readable flows to be combined.
   * @return {ReadableFlow<ReadableFlowCombineArrayResult<GRecord, GArguments>, GArguments>} A readable flow that outputs a record with the most recent values emitted by the input flows.
   */
  static combine<
    GRecord extends Record<string, ReadableFlow<any, GArguments>>,
    GArguments extends readonly unknown[],
  >(
    record: GRecord,
  ): ReadableFlow<ReadableFlowCombineRecordResult<GRecord, GArguments>, GArguments>;
  static combine<GArguments extends readonly unknown[]>(input: any): ReadableFlow<any, GArguments> {
    if (typeof input.length === 'number') {
      return this.#combine<ArrayLike<ReadableFlow<any, GArguments>>, GArguments>(input);
    } else {
      type Entry = readonly [key: string, flow: ReadableFlow<any, GArguments>];

      const entries: readonly Entry[] = Object.entries(input);

      return this.#combine<ArrayLike<ReadableFlow<any, GArguments>>, GArguments>(
        entries.map(([, flow]: Entry): ReadableFlow<any, GArguments> => flow),
      ).map((combined: any): Record<string, unknown> => {
        return Object.fromEntries(
          entries.map(([key]: Entry, index: number): [string, unknown] => {
            return [key, combined[index]];
          }),
        );
      });
    }
  }

  static #combine<
    GArray extends ArrayLike<ReadableFlow<any, GArguments>>,
    GArguments extends readonly unknown[],
  >(array: GArray): ReadableFlow<ReadableFlowCombineArrayResult<GArray, GArguments>, GArguments> {
    type GValue = any;
    type PendingStep = Promise<void> | undefined;

    const total: number = array.length;

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      ctx.signal.throwIfAborted();

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      const controller: AbortController = new AbortController();
      const signal: AbortSignal = AbortSignal.any([controller.signal, ctx.signal]);

      const values: unknown[] = new Array(total);
      let done: number = 0;

      const iterators: AsyncEnumeratorObject<void, unknown, void>[] = [];
      const pendingSteps: PendingStep[] = new Array(total);

      stack.defer(async (): Promise<void> => {
        controller.abort();

        const rejectedResults: readonly PromiseRejectedResult[] = (
          await Promise.allSettled(
            iterators.map((iterator: AsyncEnumeratorObject<void, unknown, void>): Promise<void> => {
              return Promise.try((): PromiseLike<void> => iterator[Symbol.asyncDispose]());
            }),
          )
        ).filter((result: PromiseSettledResult<void>): result is PromiseRejectedResult => {
          return result.status === 'rejected';
        });

        if (rejectedResults.length === 1) {
          throw rejectedResults[0].reason;
        } else if (rejectedResults.length > 1) {
          throw new AggregateError(
            rejectedResults.map((result: PromiseRejectedResult): unknown => {
              return result.reason;
            }),
          );
        }
      });

      for (let i: number = 0; i < total; i++) {
        iterators.push(array[i].use({ ...ctx, signal }, ...args));
        ctx.signal.throwIfAborted();
        values[i] = NONE;
      }

      while (true) {
        for (let i: number = 0; i < total; i++) {
          if (pendingSteps[i] === undefined) {
            pendingSteps[i] = iterators[i]
              .next()
              .then((result: EnumeratorResult<unknown, void>): void => {
                if (result.done) {
                  done++;
                  if (values[i] === NONE) {
                    throw new Error(`Flow #${i} completed without emitting a value.`);
                  }
                } else {
                  values[i] = result.value;
                  pendingSteps[i] = undefined;
                }
              });
          }
        }

        await Promise.all(pendingSteps);

        if (done === total) {
          return;
        }

        yield values.slice() as unknown as GValue;
      }
    });
  }

  /* FROM OTHER TYPES */

  /**
   * Creates a new ReadableFlow instance from the provided arguments.
   *
   * @param {GValue[]} values - The values to be included in the resulting flow.
   * @return {ReadableFlow<GValue, []>} A new ReadableFlow instance containing the specified values.
   */
  static of<GValue>(...values: GValue[]): ReadableFlow<GValue, []> {
    return this.fromArray<GValue>(values);
  }

  // static from<GValue, GArguments extends readonly unknown[]>(
  //   input: ReadableFlowSource<GValue, GArguments>,
  // ): ReadableFlow<GValue, GArguments> {
  //   if (input instanceof ReadableFlow) {
  //     return input;
  //   }
  //
  //   if (isAsyncGeneratorFunction<GArguments, GValue, void, void>(input)) {
  //     return new ReadableFlow<GValue, GArguments>(input as any);
  //   }
  //
  //   if (Symbol.iterator in input) {
  //     return this.fromIterable<GValue>(input);
  //   }
  //
  //   if (Symbol.asyncIterator in input) {
  //     return this.fromAsyncIterable<GValue>(input);
  //   }
  //
  //   throw new TypeError('Invalid input.');
  // }

  /**
   * Creates a new `ReadableFlow` instance using a factory function that returns a promise or a value.
   *
   * @param {ReadableFlowFromPromiseFactoryFunction<GValue, GArguments>} factory - A factory function that accepts an `AbortSignal` and additional arguments, returning a promise-like value or a direct value.
   * @return {ReadableFlow<GValue, GArguments>} A new `ReadableFlow` instance that generates values as resolved by the factory function.
   */
  static fromPromiseFactory<GValue, GArguments extends readonly unknown[]>(
    factory: ReadableFlowFromPromiseFactoryFunction<GValue, GArguments>,
  ): ReadableFlow<GValue, GArguments> {
    return new ReadableFlow<GValue, GArguments>(async function* (
      { signal }: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      yield await factory(signal, ...args);
    });
  }

  /**
   * Creates a new ReadableFlow instance from the provided iterable.
   *
   * @param {Iterable<GValue>} input - The input iterable to create a ReadableFlow from.
   * @return {ReadableFlow<GValue, []>} A new ReadableFlow instance that processes the values from the iterable.
   */
  static fromIterable<GValue>(input: Iterable<GValue>): ReadableFlow<GValue, []> {
    if (Array.isArray(input)) {
      return this.fromArray<GValue>(input);
    }

    return new ReadableFlow<GValue, []>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<GValue> {
      const iterator: Iterator<GValue> = input[Symbol.iterator]();

      try {
        while (true) {
          signal.throwIfAborted();

          const result: IteratorResult<GValue> = iterator.next();

          if (result.done) {
            return;
          }

          try {
            yield result.value;
          } catch (error: unknown) {
            if (iterator.throw === undefined) {
              throw error;
            } else {
              iterator.throw(error);
            }
          }
        }
      } finally {
        iterator.return?.();
      }
    });
  }

  /**
   * Creates a `ReadableFlow` instance from an `AsyncIterable`.
   *
   * @param {AsyncIterable<GValue>} input - The async iterable to convert into a `ReadableFlow`.
   * @return {ReadableFlow<GValue, []>} A `ReadableFlow` representing the provided `AsyncIterable`.
   */
  static fromAsyncIterable<GValue>(input: AsyncIterable<GValue>): ReadableFlow<GValue, []> {
    return new ReadableFlow<GValue, []>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<GValue> {
      const iterator: AsyncIterator<GValue> = input[Symbol.asyncIterator]();

      try {
        while (true) {
          signal.throwIfAborted();

          const result: IteratorResult<GValue> = await iterator.next();

          if (result.done) {
            return;
          }

          try {
            yield result.value;
          } catch (error: unknown) {
            if (iterator.throw === undefined) {
              throw error;
            } else {
              await iterator.throw(error);
            }
          }
        }
      } finally {
        await iterator.return?.();
      }
    });
  }

  /**
   * Creates a new ReadableFlow instance from an array-like object.
   *
   * @param {ArrayLike<GValue>} array - The array-like object to convert into a readable flow.
   * @return {ReadableFlow<GValue, []>} A readable flow that iterates over the elements of the given array-like object.
   */
  static fromArray<GValue>(array: ArrayLike<GValue>): ReadableFlow<GValue, []> {
    return new ReadableFlow<GValue, []>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<GValue> {
      for (let i: number = 0; i < array.length; i++) {
        signal.throwIfAborted();
        yield array[i];
      }
    });
  }

  /**
   * Creates a new `ReadableFlow` that always throws an error produced by the provided factory function.
   *
   * @param {Function} factory - A function that generates the error to be thrown.
   * @return {ReadableFlow<GValue, []>} A `ReadableFlow` that throws the error.
   */
  static thrown<GValue = never>(factory: () => unknown): ReadableFlow<GValue, []> {
    return new ReadableFlow<GValue, []>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<GValue> {
      signal.throwIfAborted();
      throw factory();
    });
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }

  /* ARGUMENTS */

  setArguments(...args: GArguments): ReadableFlow<GValue, []> {
    const self: ReadableFlow<GValue, GArguments> = this;
    return new ReadableFlow<GValue, []>(async function* (
      ctx: ReadableFlowContext,
    ): ReadableFlowIterator<GValue> {
      yield* self.use(ctx, ...args);
    });
  }

  /* TRANSFORM THE DATA */

  /**
   * Transforms each value in the flow using the provided mapping function.
   *
   * @param {MapFunction<GValue, GNewValue>} mapFnc - A function that takes an input value of type GValue and maps it to a new value of type GNewValue.
   * @return {ReadableFlow<GNewValue, GArguments>} A new ReadableFlow instance containing the transformed values.
   */
  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): ReadableFlow<GNewValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;
    return new ReadableFlow<GNewValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GNewValue> {
      for await (const value of self.use(ctx, ...args)) {
        yield mapFnc(value);
      }
    });
  }

  /**
   * Filters the values of the flow based on the provided filter function.
   *
   * @param {FilterFunction<GValue>} filterFnc - A function that determines whether each value in the flow should be included.
   * @return {ReadableFlow<GValue, GArguments>} A new flow containing only the values that satisfy the filter function.
   */
  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): ReadableFlow<GNewValue, GArguments>;
  filter(filterFnc: FilterFunction<GValue>): ReadableFlow<GValue, GArguments>;
  filter(filterFnc: FilterFunction<GValue>): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;
    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      for await (const value of self.use(ctx, ...args)) {
        if (filterFnc(value)) {
          yield value;
        }
      }
    });
  }

  /**
   * Transforms and filters elements of the flow based on the provided function.
   * For each element, the function is called. If the function returns `NONE`,
   * the element is filtered out; otherwise, the transformed value is included in the resulting flow.
   *
   * @param {MapFilterFunction<GValue, GNewValue>} filterFnc - A function that takes an element of the current flow
   * and returns either a transformed value or `NONE` to exclude the element.
   * @return {ReadableFlow<GNewValue, GArguments>} A new readable flow containing transformed and filtered elements.
   */
  mapFilter<GNewValue>(
    filterFnc: MapFilterFunction<GValue, GNewValue>,
  ): ReadableFlow<GNewValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;
    return new ReadableFlow<GNewValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GNewValue> {
      for await (const value of self.use(ctx, ...args)) {
        const newValue: GNewValue | None = filterFnc(value);
        if (newValue !== NONE) {
          yield newValue;
        }
      }
    });
  }

  /**
   * Produces a new flow of distinct values by comparing each emitted value with the previous one.
   * Values are considered distinct if they are not equal based on the provided equality function.
   *
   * @param {GValue | None} initialValue The initial reference value to compare against. If not provided, no initial comparison is made.
   * @param {ReadableFlowDistinctOptions<GValue>} options Configuration options for distinguishing values, which includes:
   * - `equal`: A function used to compare two values for equality. Defaults to strict equality (`===`).
   * @return {ReadableFlow<GValue, GArguments>} A new readable flow that emits distinct values.
   */
  distinct(
    initialValue: GValue | None = NONE,
    { equal = EQUAL_FUNCTION_STRICT_EQUAL }: ReadableFlowDistinctOptions<GValue> = {},
  ): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;
    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      for await (const value of self.use(ctx, ...args)) {
        if (initialValue === NONE || !equal(value, initialValue)) {
          initialValue = value;
          yield value;
        }
      }
    });
  }

  /* TRUNCATE THE FLOW */

  /**
   * Creates a new `ReadableFlow` instance that emits only the first `count` values from the current flow.
   *
   * @param {number} count The maximum number of values to take from the flow. Must be greater than or equal to 0.
   * @return {ReadableFlow<GValue, GArguments>} A new `ReadableFlow` instance emitting up to `count` values.
   */
  take(count: number): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      if (count <= 0) {
        ctx.signal.throwIfAborted();
        return;
      }

      for await (const value of self.use(ctx, ...args)) {
        yield value;

        count--;

        if (count <= 0) {
          return;
        }
      }
    });
  }

  /**
   * Creates a new `ReadableFlow` that emits values from the current flow until the `untilSource` emits a value or completes.
   *
   * @param {ReadableFlow<any, []>} untilSource - A readable flow that determines when to stop emitting values. Once this flow emits a value, the returned flow completes.
   * @return {ReadableFlow<GValue, GArguments>} A new readable flow that terminates when the `untilSource` emits its first value or completes.
   */
  takeUntil(untilSource: ReadableFlow<any, []>): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue, GArguments>(async function* (
      { signal }: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      signal.throwIfAborted();

      const controller: AbortController = new AbortController();

      const sharedSignal: AbortSignal = AbortSignal.any([signal, controller.signal]);

      await using untilActiveFlow: FlowReader<any> = untilSource.open(sharedSignal);

      const untilPromise: Promise<IteratorResult<GValue, void>> = untilActiveFlow
        .next()
        .then((): IteratorResult<GValue, void> => {
          return {
            done: true,
            value: undefined,
          };
        });

      await using reader: FlowReader<GValue> = self.open(sharedSignal, ...args);

      try {
        let result: IteratorResult<GValue>;
        while (!(result = await Promise.race([reader.next(), untilPromise])).done) {
          yield result.value;
        }
      } finally {
        controller.abort();
      }
    });
  }

  /**
   * Creates a new flow that skips a specified number of items from the beginning of the current flow.
   *
   * @param {number} count - The number of items to skip from the start of the flow.
   * @return {ReadableFlow<GValue, GArguments>} A new flow that yields all items from the current flow after skipping the specified count.
   */
  drop(count: number): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      for await (const value of self.use(ctx, ...args)) {
        if (count > 0) {
          count--;
        } else {
          yield value;
        }
      }
    });
  }

  /* TRANSFORM THE FLOW */

  /**
   * Transforms each element of the flow using the provided function and flattens the result into a single flow.
   *
   * @param {ReadableFlowFlatMapFunction<GValue, GNewValue>} flatMapFnc - A function that takes an element of the flow
   * and returns a new flow for the elements to be flattened into the resulting flow.
   * @return {ReadableFlow<GNewValue, GArguments>} A new `ReadableFlow` instance representing the flattened output flow
   * after applying the flat-map transformation.
   */
  flatMap<GNewValue>(
    flatMapFnc: ReadableFlowFlatMapFunction<GValue, GNewValue>,
  ): ReadableFlow<GNewValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GNewValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GNewValue> {
      for await (const value of self.use(ctx, ...args)) {
        yield* flatMapFnc(value).use(ctx);
      }
    });
  }

  /**
   * Creates a fork of the flow, allowing multiple consumers to independently read from the same source.
   * On the first consumer, this flow opens and sends its values to this consumer and all the following, and closes when all the consumers terminate.
   *
   * The forked flow can optionally maintain its state for a specified duration even after the last consumer ends.
   *
   * @param {Object} options - Configuration options for the fork.
   * @param {number} [options.maintainAlive=0] - The time (in milliseconds) to keep the flow alive after the last consumer disconnects. Default is 0, meaning immediate disposal.
   * @return {ReadableFlow<GValue, GArguments>} A new readable flow instance that provides a shared stream of values from the original source.
   */
  fork({ maintainAlive = 0 }: ReadableFlowForkOptions = {}): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    let consumers: number = 0;
    let readerController: AbortController | undefined;
    let reader: FlowReader<GValue> | undefined;
    let sharedPromise: Promise<IteratorResult<GValue, void>> | undefined;

    let disposePromise: Promise<void> | undefined;
    let maintainAliveTimer: any | undefined;

    return new ReadableFlow<GValue, GArguments>(async function* (
      { signal }: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      signal.throwIfAborted();

      if (maintainAliveTimer !== undefined) {
        clearTimeout(maintainAliveTimer);
        maintainAliveTimer = undefined;
      }

      if (disposePromise !== undefined) {
        await abortify(disposePromise, { signal });
      }

      consumers++;

      try {
        if (reader === undefined) {
          readerController = new AbortController();
          reader = self.open(readerController.signal, ...args);
        }

        while (true) {
          if (sharedPromise === undefined) {
            sharedPromise = reader.next().finally((): void => {
              sharedPromise = undefined;
            });
          }

          const result: IteratorResult<GValue, void> = await abortify(sharedPromise, {
            signal,
          });

          if (result.done) {
            return result.value;
          } else {
            yield result.value;
            // NOTE: we do not propagate any `.throw` directly to the reader, similar to `.return`.
          }
        }
      } finally {
        consumers--;

        if (consumers === 0) {
          const dispose = async (): Promise<void> => {
            readerController!.abort(signal.reason);
            readerController = undefined;

            const { promise, resolve } = Promise.withResolvers<void>();
            disposePromise = promise;

            try {
              await reader![Symbol.asyncDispose]();
            } finally {
              reader = undefined;
              disposePromise = undefined;
              resolve();
            }
          };

          if (maintainAlive <= 0) {
            await dispose();
          } else {
            maintainAliveTimer = setTimeout((): void => {
              maintainAliveTimer = undefined;
              dispose().catch(reportError);
            }, maintainAlive);
          }
        }
      }
    });
  }

  /* INSPECT THE FLOW */

  /**
   * Inspects the flow by invoking specified callbacks at various stages of its lifecycle.
   * Allows the execution of provided hooks to monitor or manipulate the flow's behavior.
   *
   * @param {ReadableFlowInspectOptions<GValue, GArguments>} [options={}] The set of lifecycle hooks to be invoked.
   * - `open`: A callback invoked when the flow starts.
   * - `next`: A callback invoked for each value being yielded by the flow.
   * - `error`: A callback invoked when an error occurs in the flow.
   * - `close`: A callback invoked when the flow finishes or is closed.
   * @return {ReadableFlow<GValue, GArguments>} A new readable flow with inspection hooks applied.
   */
  inspect(
    options: ReadableFlowInspectOptions<GValue, GArguments> = {},
  ): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    const run = <GKey extends keyof ReadableFlowInspectOptions<GValue, GArguments>>(
      key: GKey,
      ...args: Parameters<Required<ReadableFlowInspectOptions<GValue, GArguments>>[GKey]>
    ): void => {
      const fnc: ReadableFlowInspectOptions<GValue, GArguments>[GKey] | undefined = Reflect.get(
        options,
        key,
      );
      if (fnc !== undefined) {
        try {
          Reflect.apply(fnc, undefined, args);
        } catch (error: unknown) {
          reportError(error);
        }
      }
    };

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      run('open', ...(args as any));

      try {
        for await (const value of self.use(ctx, ...args)) {
          run('next', value);
          yield value;
        }
      } catch (error: unknown) {
        run('error', error);
        throw error;
      } finally {
        run('close');
      }
    });
  }

  /**
   * Registers a callback to handle errors thrown during the execution of the current flow.
   *
   * @param {ReadableFlowCatchFunction<GNewValue>} callback - A callback function to handle errors. It takes the thrown error as its parameter and must return a new readable flow as its result.
   * @return {ReadableFlow<GValue | GNewValue, GArguments>} A new readable flow that continues with the current flow's results or with the result of the error handling callback in case of an error.
   */
  catch<GNewValue>(
    callback: ReadableFlowCatchFunction<GNewValue>,
  ): ReadableFlow<GValue | GNewValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue | GNewValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue | GNewValue> {
      try {
        yield* self.use(ctx, ...args);
      } catch (error: unknown) {
        yield* callback(error).use(ctx);
      }
    });
  }

  /**
   * Registers a function to be executed when the flow is completed, regardless of whether it succeeded or failed.
   *
   * @param {ReadableFlowFinallyFunction} finallyFnc - A function to be invoked after the flow has been executed.
   * It can optionally return a promise, and the flow will wait for the promise to resolve or reject.
   * @return {ReadableFlow<GValue, GArguments>} A new instance of ReadableFlow that ensures the provided `finally` function
   * is executed after the flow completes.
   */
  finally(finallyFnc: ReadableFlowFinallyFunction): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      try {
        yield* self.use(ctx, ...args);
      } finally {
        await finallyFnc(ctx.signal);
      }
    });
  }

  /* PROMISE-BASED RETURN */

  /**
   * Converts this readable flow into an array containing the values emitted by the flow.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {...GArguments} args - Additional arguments to pass to the `open` method.
   * @return {Promise<GValue[]>} A promise that resolves to an array of `GValue`.
   */
  toArray(signal: AbortSignal, ...args: GArguments): Promise<GValue[]> {
    return Array.fromAsync<GValue>(this.open(signal, ...args));
  }

  /**
   * Retrieves the first value sent by the flow.
   * If the stream is completed without sending a value, an error is thrown.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<GValue>} A promise that resolves to the first value emitted by the flow.
   * @throws {Error} If the flow completes without sending a value.
   */
  async first(signal: AbortSignal, ...args: GArguments): Promise<GValue> {
    await using reader: FlowReader<GValue> = this.open(signal, ...args);

    const result: IteratorResult<GValue, void> = await reader.next();

    if (result.done) {
      throw new Error('Complete without sending a value.');
    }

    return result.value;
  }

  /**
   * Retrieves the last value emitted by the flow.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<GValue>} A promise that resolves to the last emitted value.
   * @throws {Error} If the operation completes without emitting any value.
   */
  async last(signal: AbortSignal, ...args: GArguments): Promise<GValue> {
    let lastValue: GValue;
    let hasValue: boolean = false;

    for await (const value of this.open(signal, ...args)) {
      lastValue = value;
      hasValue = true;
    }

    if (!hasValue) {
      throw new Error('Complete without sending a value.');
    }

    return lastValue!;
  }

  /**
   * Iterates over the flow and invokes the provided callback for each value.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {ReadableFlowForEachFunction<GValue>} callback - The function to execute for each value in the flow.
   * @param {GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<void>} A promise that resolves once all values have been processed or rejects if an error occurs.
   */
  async forEach(
    signal: AbortSignal,
    callback: ReadableFlowForEachFunction<GValue>,
    ...args: GArguments
  ): Promise<void> {
    for await (const value of this.open(signal, ...args)) {
      await callback(value, signal);
    }
  }

  /**
   * Returns `true` if one of the values emitted by the flow satisfies the provided predicate.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {FilterFunction<GValue>} predicate - A function to test each value from the flow. It should return a boolean.
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<boolean>} A promise that resolves to true if at least one value satisfies the predicate, otherwise false.
   */
  async some(
    signal: AbortSignal,
    predicate: FilterFunction<GValue>,
    ...args: GArguments
  ): Promise<boolean> {
    for await (const value of this.open(signal, ...args)) {
      if (predicate(value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns `true` if all the values emitted by the flow satisfy the provided predicate.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {FilterFunction<GValue>} predicate - A function to test each value from the flow. It should return a boolean.
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<boolean>} A promise that resolves to true if all the values satisfy the predicate, otherwise false.
   */
  async every(
    signal: AbortSignal,
    predicate: FilterFunction<GValue>,
    ...args: GArguments
  ): Promise<boolean> {
    for await (const value of this.open(signal, ...args)) {
      if (!predicate(value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Reduces the values produced by the flow using the provided reducer function.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {ReduceFunction<GValue, GReducedValue>} reducer - A function that takes the accumulated value and the current value, and returns the new accumulated value.
   * @param {GReducedValue | None} initialValue - The initial value for the reduction or a special value indicating no initial value.
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<GReducedValue>} A promise that resolves with the final reduced value after the iteration completes.
   */
  reduce(
    signal: AbortSignal,
    reducer: ReduceFunction<GValue, GValue>,
    initialValue: None,
    ...args: GArguments
  ): Promise<GValue>;
  reduce<GReducedValue extends GValue>(
    signal: AbortSignal,
    reducer: ReduceFunction<GValue, GReducedValue>,
    initialValue: GReducedValue,
    ...args: GArguments
  ): Promise<GReducedValue>;
  async reduce<GReducedValue extends GValue>(
    signal: AbortSignal,
    reducer: ReduceFunction<GValue, GReducedValue>,
    initialValue: GReducedValue | None,
    ...args: GArguments
  ): Promise<GReducedValue> {
    for await (const value of this.open(signal, ...args)) {
      if (initialValue === NONE) {
        initialValue = value as GReducedValue;
        continue;
      }

      initialValue = reducer(initialValue, value);
    }

    return initialValue as GReducedValue;
  }

  /**
   * Finds an item in a collection that matches the provided predicate.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {FilterFunctionWithSubType<GValue, GFilteredValue>} predicate - A function used to test each item in the collection.
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {Promise<GFilteredValue | undefined>} A promise that resolves to the first item that matches the predicate, or `undefined` if no match is found.
   */
  find<GFilteredValue extends GValue>(
    signal: AbortSignal,
    predicate: FilterFunctionWithSubType<GValue, GFilteredValue>,
    ...args: GArguments
  ): Promise<GFilteredValue | undefined>;
  find(
    signal: AbortSignal,
    predicate: FilterFunction<GValue>,
    ...args: GArguments
  ): Promise<GValue | undefined>;
  async find(
    signal: AbortSignal,
    predicate: FilterFunction<GValue>,
    ...args: GArguments
  ): Promise<GValue | undefined> {
    for await (const value of this.open(signal, ...args)) {
      if (predicate(value)) {
        return value;
      }
    }
    return undefined;
  }

  /* CAST TO OTHER KIND OF STREAMS */

  /**
   * Converts this flow into a `ReadableStream`. This stream mimics the behavior of this flow.
   *
   * @param {...GArguments} args - Additional arguments to pass to the flow.
   * @return {ReadableStream<GValue>} A `ReadableStream` that mimics the behavior of this flow.
   */
  toReadableStream(...args: GArguments): ReadableStream<GValue> {
    let reader: FlowReader<GValue>;
    const abortController: AbortController = new AbortController();

    return new ReadableStream<GValue>({
      start: (): void => {
        reader = this.open(abortController.signal, ...args);
      },
      pull: async (controller: ReadableStreamDefaultController<GValue>): Promise<void> => {
        let result: IteratorResult<GValue, void>;

        try {
          result = await reader.next();
        } catch (error: unknown) {
          controller.error(error);
          return;
        }

        if (result.done) {
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      },
      cancel: async (reason?: any): Promise<void> => {
        abortController.abort(reason);
        await reader.return();
      },
    });
  }
}
