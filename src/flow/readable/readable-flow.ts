import { abortify } from '@xstd/abortable';
import { listen } from '@xstd/disposable';
import { EQUAL_FUNCTION_STRICT_EQUAL } from '@xstd/equal-function';
import {
  type FilterFunction,
  type FilterFunctionWithSubType,
  type MapFilterFunction,
  type MapFunction,
  type ReduceFunction,
} from '@xstd/functional';
import { type None, NONE } from '@xstd/none';
import { noop } from '@xstd/noop';
import { type HavingQueuingStrategy } from '../../shared/queue-controller/classic/having-queuing-strategy.js';
import { CountSharedQueue } from '../../shared/queue-controller/shared/built-in/count-shared-queue.js';
import { type SharedQueueFork } from '../../shared/queue-controller/shared/shared-queue-fork.js';
import { type SharedQueue } from '../../shared/queue-controller/shared/shared-queue.js';
import { flowSyncBridge } from '../bridge/flow-sync-bridge.js';
import { Flow } from '../flow/flow.js';
import { type FlowReader } from './types/flow-reader.js';
import { type ReadableFlowDistinctOptions } from './types/methods/distinct/readable-flow-distinct-options.js';
import { type FlowFlatMapFunction } from './types/methods/flat-map/flow-flat-map-function.js';
import { type ReadableFlowForkOptions } from './types/methods/fork/readable-flow-fork-options.js';
import { type FlowInspectOptions } from './types/methods/inspect/flow-inspect-options.js';
import { type ReadableFlowContext } from './types/readable-flow-context.js';
import { type ReadableFlowIterator } from './types/readable-flow-iterator.js';

export class ReadableFlow<GValue, GArguments extends readonly unknown[] = []> extends Flow<
  void,
  GValue,
  void,
  GArguments
> {
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
  ): ReadableFlow<GEvent, [options?: HavingQueuingStrategy]> {
    return new ReadableFlow<GEvent, [options?: HavingQueuingStrategy]>(async function* (
      { signal }: ReadableFlowContext,
      options?: HavingQueuingStrategy,
    ): ReadableFlowIterator<GEvent> {
      signal.throwIfAborted();

      const [bridge, reader] = flowSyncBridge<GEvent>(signal, options);

      using _eventListener: Disposable = listen(target, type, (event: Event): void => {
        void bridge.next(event as GEvent);
      });

      yield* reader;
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

  static of<GValue>(...values: GValue[]): ReadableFlow<GValue, []> {
    return new ReadableFlow<GValue, []>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<GValue> {
      for (let i: number = 0; i < values.length; i++) {
        signal.throwIfAborted();
        yield values[i];
      }
    });
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

  static fromPromiseFactory<GValue, GArguments extends readonly unknown[]>(
    factory: (signal: AbortSignal, ...args: GArguments) => PromiseLike<GValue> | GValue,
  ): ReadableFlow<GValue, GArguments> {
    return new ReadableFlow<GValue, GArguments>(async function* (
      { signal }: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      yield await factory(signal, ...args);
    });
  }

  static fromIterable<GValue>(input: Iterable<GValue>): ReadableFlow<GValue, []> {
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

  flatMap<GNewValue>(
    flatMapFnc: FlowFlatMapFunction<GValue, GNewValue>,
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
   * @experimental
   */
  // loop(delay: number): ReadableFlow<GValue> {
  //   const self: ReadableFlow<GValue> = this;
  //
  //   return new ReadableFlow<GValue>(async function* (
  //     ctx: ReadableFlowContext,
  //   ): ReadableFlowIterator<GValue> {
  //     while (true) {
  //       try {
  //         yield* self.use(ctx);
  //       } finally {
  //         await sleep(delay, { signal: ctx.signal });
  //       }
  //     }
  //   });
  // }

  fork({
    queuingStrategy = CountSharedQueue.zero,
    disposeHook,
  }: ReadableFlowForkOptions = {}): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    type IteratorPromise = Promise<IteratorResult<GValue, void>>;

    let consumers: number = 0;
    let readerController: AbortController | undefined;
    let reader: FlowReader<GValue> | undefined;
    let sharedQueue: SharedQueue<IteratorPromise> | undefined;
    let iteratorStepPromise: IteratorPromise | undefined;

    let disposeController: AbortController | undefined;
    let disposePromise: Promise<void> | undefined;

    return new ReadableFlow<GValue, GArguments>(async function* (
      { signal }: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      signal.throwIfAborted();

      if (disposeController !== undefined) {
        // abort postponed dispose
        disposeController.abort(new Error('Cancelled.'));
        disposeController = undefined;
        disposePromise = undefined;
      }

      if (disposePromise !== undefined) {
        await abortify(disposePromise.catch(noop), { signal });
      }

      consumers++;

      try {
        if (reader === undefined) {
          readerController = new AbortController();
          reader = self.open(readerController.signal, ...args);
          sharedQueue = queuingStrategy<IteratorPromise>();
        }

        const localQueue: SharedQueueFork<IteratorPromise> = sharedQueue!.fork();
        let localIteratorStepPromise: IteratorPromise | undefined;

        while (true) {
          let cachedIteratorStepPromise: IteratorPromise | None;
          // dequeue the steps of the queue that have already been treated
          while ((cachedIteratorStepPromise = localQueue.pull()) === localIteratorStepPromise);

          if (cachedIteratorStepPromise === NONE) {
            // └> no step in the queue
            if (iteratorStepPromise === undefined) {
              // └> no shared step
              // => we need to iterate
              iteratorStepPromise = reader.next().finally((): void => {
                iteratorStepPromise = undefined;
              });
              // append the step to the queue
              sharedQueue!.push(iteratorStepPromise);
            }
            localIteratorStepPromise = iteratorStepPromise;
          } else {
            // => use the cached step
            localIteratorStepPromise = cachedIteratorStepPromise;
          }

          const result: IteratorResult<GValue, void> = await abortify(localIteratorStepPromise, {
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

            try {
              return await reader![Symbol.asyncDispose]();
            } finally {
              reader = undefined;
              sharedQueue = undefined;
              disposeController = undefined;
              disposePromise = undefined;
            }
          };

          if (disposeHook === undefined) {
            await (disposePromise = dispose());
          } else {
            const controller: AbortController = new AbortController();
            const { promise, resolve, reject } = Promise.withResolvers<any>();
            disposeController = controller;
            disposePromise = promise;

            disposeHook(controller.signal, (): Promise<void> => {
              controller.signal.throwIfAborted();
              controller.abort(new Error('Already disposed.'));

              return dispose().then(resolve, reject);
            });

            if (controller.signal.aborted) {
              await disposePromise;
            }
          }
        }
      }
    });
  }

  /* INSPECT THE FLOW */

  inspect(options: FlowInspectOptions<GValue, GArguments> = {}): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

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

  finally(finallyFnc: () => PromiseLike<void> | void): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      try {
        yield* self.use(ctx, ...args);
      } finally {
        await finallyFnc();
      }
    });
  }

  /* PROMISE-BASED RETURN */

  toArray(signal: AbortSignal, ...args: GArguments): Promise<GValue[]> {
    return Array.fromAsync<GValue>(this.open(signal, ...args));
  }

  // TODO: forEach, find

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

  async first(signal: AbortSignal, ...args: GArguments): Promise<GValue> {
    await using reader: FlowReader<GValue> = this.open(signal, ...args);

    const result: IteratorResult<GValue, void> = await reader.next();

    if (result.done) {
      throw new Error('Complete without sending a value.');
    }

    return result.value;
  }

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

  /* CAST TO OTHER KIND OF STREAMS */

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
