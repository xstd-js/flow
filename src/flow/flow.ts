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
import { AsyncStepper } from '../async-stepper/async-stepper.js';
import { type FlowContext } from './types/flow-context.js';
import { type FlowIterator } from './types/flow-iterator.js';
import { type FlowReader } from './types/flow-reader.js';
import { type FlowCatchFunction } from './types/methods/catch/flow-catch-function.js';
import { type FlowCombineArrayResult } from './types/methods/combine/flow-combine-array-result.js';
import { type FlowCombineRecordResult } from './types/methods/combine/flow-combine-record-result.js';
import { type FlowDistinctOptions } from './types/methods/distinct/flow-distinct-options.js';
import { type FlowFinallyFunction } from './types/methods/finally/flow-finally-function.js';
import { type FlowFlatMapFunction } from './types/methods/flat-map/flow-flat-map-function.js';
import { type FlowForEachFunction } from './types/methods/for-each/flow-for-each-function.js';
import { type FlowForkOptions } from './types/methods/fork/flow-fork-options.js';
import { type FlowInspectOptions } from './types/methods/inspect/flow-inspect-options.js';
import { type FlowMapArgumentsFunction } from './types/methods/map-arguments/flow-map-arguments-function.js';
import { type FlowFromPromiseFactoryFunction } from './types/static-methods/from-promise-factory/flow-from-promise-factory-function.js';
import { type InitPushSource } from './types/static-methods/from-push-source/init-push-source.js';
import { type PushBridge } from './types/static-methods/from-push-source/push-bridge.js';
import { type PushToPullOptions } from './types/static-methods/from-push-source/push-to-pull-options.js';
import { type QueueStep } from './types/static-methods/from-push-source/queue-step.js';

/**
 * Represents a stream of values that can be consumed asynchronously.
 *
 * @template GValue The type of values emitted by the flow.
 * @template GArguments Additional arguments to pass to the flow.
 * @extends {AsyncStepper<void, GValue, void, GArguments>}
 */
export class Flow<GValue, GArguments extends readonly unknown[] = []> extends AsyncStepper<
  void,
  GValue,
  void,
  GArguments
> {
  /* PUSH TO PULL */

  /**
   * Creates a `Flow` from a push-based data source.
   *
   * @template GValue The type of values emitted by the flow.
   * @param {InitPushSource<GValue>} init - A function to initialize the push-based data source. The function receives a controller object that includes methods for pushing the next value, signaling an error, or completing the stream, as well as an `AbortSignal` for handling cancellations.
   * @returns {Flow<GValue, [options?: PushToPullOptions]>} A `Flow` that converts the push-based data source into a pull-based stream.
   */
  static fromPushSource<GValue>(
    init: InitPushSource<GValue>,
  ): Flow<GValue, [options?: PushToPullOptions]> {
    return new Flow<GValue, [options?: PushToPullOptions]>(async function* (
      { signal }: FlowContext,
      { dataRetentionTime = 0 }: PushToPullOptions = {},
    ): FlowIterator<GValue> {
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
   * Creates a `Flow` that listens to a specified event type on a given `EventTarget`.
   *
   * @template GEvent The type of event to listen for.
   * @param {EventTarget} target - The target object to listen for events on.
   * @param {string} type - The type of event to listen for.
   * @returns {Flow<GEvent, [options?: PushToPullOptions]>} A readable flow that emits events of the specified type.
   */
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
  ): Flow<GEvent, [options?: PushToPullOptions]> {
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
   * @param {Flow<GValue, GArguments>[]} flows - An array of readable flows to be concatenated.
   * @returns {Flow<GValue, GArguments>} A single concatenated readable flow combining all inputs.
   */
  static concat<GValue, GArguments extends readonly unknown[]>(
    ...flows: Flow<GValue, GArguments>[]
  ): Flow<GValue, GArguments> {
    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * Combines multiple flows into a single flow that produces an array of the latest values emitted from each flow.
   *
   * @param {GArray} array - An array-like object containing readable flows to be combined.
   * @returns {Flow<FlowCombineArrayResult<GArray, GArguments>, GArguments>} A flow that outputs an array with the most recent values emitted by the input flows.
   */
  static combine<
    GArray extends ArrayLike<Flow<any, GArguments>>,
    GArguments extends readonly unknown[],
  >(array: GArray): Flow<FlowCombineArrayResult<GArray, GArguments>, GArguments>;
  /**
   * Combines multiple flows into a single flow that produces a record of the latest values emitted from each flow.
   *
   * @param {GRecord} record - A record containing readable flows to be combined.
   * @returns {Flow<FlowCombineArrayResult<GRecord, GArguments>, GArguments>} A flow that outputs a record with the most recent values emitted by the input flows.
   */
  static combine<
    GRecord extends Record<string, Flow<any, GArguments>>,
    GArguments extends readonly unknown[],
  >(record: GRecord): Flow<FlowCombineRecordResult<GRecord, GArguments>, GArguments>;
  static combine<GArguments extends readonly unknown[]>(input: any): Flow<any, GArguments> {
    if (typeof input.length === 'number') {
      return this.#combine<ArrayLike<Flow<any, GArguments>>, GArguments>(input);
    } else {
      type Entry = readonly [key: string, flow: Flow<any, GArguments>];

      const entries: readonly Entry[] = Object.entries(input);

      return this.#combine<ArrayLike<Flow<any, GArguments>>, GArguments>(
        entries.map(([, flow]: Entry): Flow<any, GArguments> => flow),
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
    GArray extends ArrayLike<Flow<any, GArguments>>,
    GArguments extends readonly unknown[],
  >(array: GArray): Flow<FlowCombineArrayResult<GArray, GArguments>, GArguments> {
    type GValue = any;
    type PendingStep = Promise<void> | undefined;

    const total: number = array.length;

    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * Creates a new Flow instance from the provided arguments.
   *
   * @param {GValue[]} values - The values to be included in the resulting flow.
   * @returns {Flow<GValue, []>} A new Flow instance containing the specified values.
   */
  static of<GValue>(...values: GValue[]): Flow<GValue, []> {
    return this.fromArray<GValue>(values);
  }

  // static from<GValue, GArguments extends readonly unknown[]>(
  //   input: FlowSource<GValue, GArguments>,
  // ): Flow<GValue, GArguments> {
  //   if (input instanceof Flow) {
  //     return input;
  //   }
  //
  //   if (isAsyncGeneratorFunction<GArguments, GValue, void, void>(input)) {
  //     return new Flow<GValue, GArguments>(input as any);
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
   * Creates a new `Flow` instance using a factory function that returns a promise or a value.
   *
   * @param {FlowFromPromiseFactoryFunction<GValue, GArguments>} factory - A factory function that accepts an `AbortSignal` and additional arguments, returning a promise-like value or a direct value.
   * @returns {Flow<GValue, GArguments>} A new `Flow` instance that generates values as resolved by the factory function.
   */
  static fromPromiseFactory<GValue, GArguments extends readonly unknown[]>(
    factory: FlowFromPromiseFactoryFunction<GValue, GArguments>,
  ): Flow<GValue, GArguments> {
    return new Flow<GValue, GArguments>(async function* (
      { signal }: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
      yield await factory(signal, ...args);
    });
  }

  /**
   * Creates a new Flow instance from the provided iterable.
   *
   * @param {Iterable<GValue>} input - The input iterable to create a Flow from.
   * @returns {Flow<GValue, []>} A new Flow instance that processes the values from the iterable.
   */
  static fromIterable<GValue>(input: Iterable<GValue>): Flow<GValue, []> {
    if (Array.isArray(input)) {
      return this.fromArray<GValue>(input);
    }

    // NOTE: this algorithm is really similar to `yield * input`. Hoverer, it supports cancellation.

    return new Flow<GValue, []>(async function* ({ signal }: FlowContext): FlowIterator<GValue> {
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
   * Creates a `Flow` instance from an `AsyncIterable`.
   *
   * @param {AsyncIterable<GValue>} input - The async iterable to convert into a `Flow`.
   * @returns {Flow<GValue, []>} A `Flow` representing the provided `AsyncIterable`.
   */
  static fromAsyncIterable<GValue>(input: AsyncIterable<GValue>): Flow<GValue, []> {
    // NOTE: this algorithm is really similar to `yield * input`. Hoverer, it supports cancellation.

    return new Flow<GValue, []>(async function* ({ signal }: FlowContext): FlowIterator<GValue> {
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
   * Creates a new Flow instance from an array-like object.
   *
   * @param {ArrayLike<GValue>} array - The array-like object to convert into a readable flow.
   * @returns {Flow<GValue, []>} A readable flow that iterates over the elements of the given array-like object.
   */
  static fromArray<GValue>(array: ArrayLike<GValue>): Flow<GValue, []> {
    return new Flow<GValue, []>(async function* ({ signal }: FlowContext): FlowIterator<GValue> {
      for (let i: number = 0; i < array.length; i++) {
        signal.throwIfAborted();
        yield array[i];
      }
    });
  }

  /**
   * Creates a new `Flow` that always throws an error produced by the provided factory function.
   *
   * @param {Function} factory - A function that generates the error to be thrown.
   * @returns {Flow<GValue, []>} A `Flow` that throws the error.
   */
  static thrown<GValue = never>(factory: () => unknown): Flow<GValue, []> {
    return new Flow<GValue, []>(async function* ({ signal }: FlowContext): FlowIterator<GValue> {
      signal.throwIfAborted();
      throw factory();
    });
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }

  /* ARGUMENTS */

  /**
   * Transforms the arguments of the current flow using the provided mapping function.
   *
   * @param {FlowMapArgumentsFunction<GNewArguments, GArguments>} mapFnc - A function that maps the new arguments to the current flow's arguments.
   * @returns {Flow<GValue, GNewArguments>} A new `Flow` instance with transformed arguments.
   */
  mapArguments<GNewArguments extends readonly unknown[]>(
    mapFnc: FlowMapArgumentsFunction<GNewArguments, GArguments>,
  ): Flow<GValue, GNewArguments> {
    const self: Flow<GValue, GArguments> = this;
    return new Flow<GValue, GNewArguments>(async function* (
      ctx: FlowContext,
      ...args: GNewArguments
    ): FlowIterator<GValue> {
      yield* self.use(ctx, ...mapFnc(...args));
    });
  }

  // snapArgs(context: (args: () => GArguments) => Flow<GValue, GArguments>): Flow<GValue, GArguments> {
  //   const self: Flow<GValue, GArguments> = this;
  //   return new Flow<GValue, GArguments>(async function* (
  //     ctx: FlowContext,
  //     ...args: GArguments
  //   ): FlowIterator<GValue> {
  //     yield* self.use(ctx, ...args);
  //   });
  // }

  /* TRANSFORM THE DATA */

  /**
   * Transforms each value in the flow using the provided mapping function.
   *
   * @template GNewValue The type of the values produced by the mapping function.
   * @param {MapFunction<GValue, GNewValue>} mapFnc - A function that takes an input value of type GValue and maps it to a new value of type GNewValue.
   * @returns {Flow<GNewValue, GArguments>} A new Flow instance containing the transformed values.
   */
  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): Flow<GNewValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;
    return new Flow<GNewValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GNewValue> {
      for await (const value of self.use(ctx, ...args)) {
        yield mapFnc(value);
      }
    });
  }

  /**
   * Filters the values of the flow based on the provided filter function.
   *
   * @template GNewValue The type of the values filtered in the resulting flow.
   * @param {FilterFunction<GValue>} filterFnc - A function that determines whether each value in the flow should be included.
   * @returns {Flow<GValue, GArguments>} A new flow containing only the values that satisfy the filter function.
   */
  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): Flow<GNewValue, GArguments>;
  filter(filterFnc: FilterFunction<GValue>): Flow<GValue, GArguments>;
  filter(filterFnc: FilterFunction<GValue>): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;
    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * @template GNewValue The type of the transformed values.
   * @param {MapFilterFunction<GValue, GNewValue>} filterFnc - A function that takes an element of the current flow
   * and returns either a transformed value or `NONE` to exclude the element.
   * @returns {Flow<GNewValue, GArguments>} A new flow containing transformed and filtered elements.
   */
  mapFilter<GNewValue>(
    filterFnc: MapFilterFunction<GValue, GNewValue>,
  ): Flow<GNewValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;
    return new Flow<GNewValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GNewValue> {
      for await (const value of self.use(ctx, ...args)) {
        const newValue: GNewValue | None = filterFnc(value);
        if (newValue !== NONE) {
          yield newValue;
        }
      }
    });
  }

  // mapFilter<GNewValue>(
  //   filterFnc: FlowMapFilterFunction<GValue, GNewValue, GArguments>,
  // ): Flow<GNewValue, GArguments> {
  //   const self: Flow<GValue, GArguments> = this;
  //   return new Flow<GNewValue, GArguments>(async function* (
  //     ctx: FlowContext,
  //     ...args: GArguments
  //   ): FlowIterator<GNewValue> {
  //     let retry: number = 0;
  //     for await (const value of self.use(ctx, ...args)) {
  //       const newValue: GNewValue | None = await filterFnc(value, args, retry++);
  //       if (newValue !== NONE) {
  //         retry = 0;
  //         yield newValue;
  //       }
  //     }
  //   });
  // }

  /**
   * Produces a new flow of distinct values by comparing each emitted value with the previous one.
   * Values are considered distinct if they are not equal based on the provided equality function.
   *
   * @param {GValue | None} initialValue - The initial reference value to compare against. If not provided, no initial comparison is made.
   * @param {FlowDistinctOptions<GValue>} options - Configuration options for distinguishing values, which includes:
   * - `equal`: A function used to compare two values for equality. Defaults to strict equality (`===`).
   * @returns {Flow<GValue, GArguments>} A new flow that emits distinct values.
   */
  distinct(
    initialValue: GValue | None = NONE,
    { equal = EQUAL_FUNCTION_STRICT_EQUAL }: FlowDistinctOptions<GValue> = {},
  ): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;
    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * Creates a new `Flow` instance that emits only the first `count` values from the current flow.
   *
   * @param {number} count - The maximum number of values to take from the flow. Must be greater than or equal to 0.
   * @returns {Flow<GValue, GArguments>} A new `Flow` instance emitting up to `count` values.
   */
  take(count: number): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * Creates a new `Flow` that emits values from the current flow until the `untilSource` emits a value or completes.
   *
   * @param {Flow<any, []>} untilSource - A flow that determines when to stop emitting values. Once this flow emits a value, the returned flow completes.
   * @returns {Flow<GValue, GArguments>} A new flow that terminates when the `untilSource` emits its first value or completes.
   */
  takeUntil(untilSource: Flow<any, []>): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    return new Flow<GValue, GArguments>(async function* (
      { signal }: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * @returns {Flow<GValue, GArguments>} A new flow that yields all items from the current flow after skipping the specified count.
   */
  drop(count: number): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * @template GNewValue The type of the values produced by the new flow.
   * @param {FlowFlatMapFunction<GValue, GNewValue>} flatMapFnc - A function that takes an element of the flow
   * and returns a new flow for the elements to be flattened into the resulting flow.
   * @returns {Flow<GNewValue, GArguments>} A new `Flow` instance representing the flattened output flow
   * after applying the flat-map transformation.
   */
  flatMap<GNewValue>(
    flatMapFnc: FlowFlatMapFunction<GValue, GNewValue>,
  ): Flow<GNewValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    return new Flow<GNewValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GNewValue> {
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
   * @returns {Flow<GValue, GArguments>} A new flow instance that provides a shared stream of values from the original source.
   */
  fork({ maintainAlive = 0 }: FlowForkOptions = {}): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    let consumers: number = 0;
    let readerController: AbortController | undefined;
    let reader: FlowReader<GValue> | undefined;
    let sharedPromise: Promise<IteratorResult<GValue, void>> | undefined;

    let disposePromise: Promise<void> | undefined;
    let maintainAliveTimer: any | undefined;

    return new Flow<GValue, GArguments>(async function* (
      { signal }: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * @param {FlowInspectOptions<GValue, GArguments>} [options={}] - The set of lifecycle hooks to be invoked.
   * - `open`: A callback invoked when the flow starts.
   * - `next`: A callback invoked for each value being yielded by the flow.
   * - `error`: A callback invoked when an error occurs in the flow.
   * - `close`: A callback invoked when the flow finishes or is closed.
   * @returns {Flow<GValue, GArguments>} A new flow with inspection hooks applied.
   */
  inspect(options: FlowInspectOptions<GValue, GArguments> = {}): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    const run = <GKey extends keyof FlowInspectOptions<GValue, GArguments>>(
      key: GKey,
      ...args: Parameters<Required<FlowInspectOptions<GValue, GArguments>>[GKey]>
    ): void => {
      const fnc: FlowInspectOptions<GValue, GArguments>[GKey] | undefined = Reflect.get(
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

    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
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
   * @template GNewValue The type of the values produced by the new flow.
   * @param {FlowCatchFunction<GNewValue>} callback - A callback function to handle errors. It takes the thrown error as its parameter and must return a new flow as its result.
   * @returns {Flow<GValue | GNewValue, GArguments>} A new flow that continues with the current flow's results or with the result of the error handling callback in case of an error.
   */
  catch<GNewValue>(callback: FlowCatchFunction<GNewValue>): Flow<GValue | GNewValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    return new Flow<GValue | GNewValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue | GNewValue> {
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
   * @param {FlowFinallyFunction} finallyFnc - A function to be invoked after the flow has been executed.
   * It can optionally return a promise, and the flow will wait for the promise to resolve or reject.
   * @returns {Flow<GValue, GArguments>} A new instance of Flow that ensures the provided `finally` function
   * is executed after the flow completes.
   */
  finally(finallyFnc: FlowFinallyFunction): Flow<GValue, GArguments> {
    const self: Flow<GValue, GArguments> = this;

    return new Flow<GValue, GArguments>(async function* (
      ctx: FlowContext,
      ...args: GArguments
    ): FlowIterator<GValue> {
      try {
        yield* self.use(ctx, ...args);
      } finally {
        await finallyFnc(ctx.signal);
      }
    });
  }

  /* PROMISE-BASED RETURN */

  /**
   * Converts this flow into an array containing the values emitted by the flow.
   *
   * @param {AbortSignal} signal - An AbortSignal to allow for the operation to be canceled.
   * @param {...GArguments} args - Additional arguments to pass to the `open` method.
   * @returns {Promise<GValue[]>} A promise that resolves to an array of `GValue`.
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
   * @returns {Promise<GValue>} A promise that resolves to the first value emitted by the flow.
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
   * @returns {Promise<GValue>} A promise that resolves to the last emitted value.
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
   * @param {FlowForEachFunction<GValue>} callback - The function to execute for each value in the flow.
   * @param {GArguments} args - Additional arguments to pass to the flow.
   * @returns {Promise<void>} A promise that resolves once all values have been processed or rejects if an error occurs.
   */
  async forEach(
    signal: AbortSignal,
    callback: FlowForEachFunction<GValue>,
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
   * @returns {Promise<boolean>} A promise that resolves to true if at least one value satisfies the predicate, otherwise false.
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
   * @returns {Promise<boolean>} A promise that resolves to true if all the values satisfy the predicate, otherwise false.
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
   * @returns {Promise<GReducedValue>} A promise that resolves with the final reduced value after the iteration completes.
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
   * @returns {Promise<GFilteredValue | undefined>} A promise that resolves to the first item that matches the predicate, or `undefined` if no match is found.
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
   * @returns {ReadableStream<GValue>} A `ReadableStream` that mimics the behavior of this flow.
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
