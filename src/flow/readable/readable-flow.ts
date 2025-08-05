import { abortify, sleep } from '@xstd/abortable';
import { isAsyncGeneratorFunction } from '@xstd/async-generator';
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
import { type PushToPullOptions } from '../../shared/push-to-pull-options.js';
import { flowSyncBridge } from '../bridge/flow-sync-bridge.js';
import { Flow } from '../flow/flow.js';
import { type FlowReader } from './types/flow-reader.js';
import { ReadableFlowDistinctOptions } from './types/methods/distinct/readable-flow-distinct-options.js';
import { type FlowFlatMapFunction } from './types/methods/flat-map/flow-flat-map-function.js';
import { type FlowForkedValue } from './types/methods/fork/flow-forked-value.js';
import { type FlowInspectOptions } from './types/methods/inspect/flow-inspect-options.js';
import { type ReadableFlowContext } from './types/readable-flow-context.js';
import { type ReadableFlowIterator } from './types/readable-flow-iterator.js';
import { ReadableFlowSource } from './types/readable-flow-source.js';

export class ReadableFlow<GValue, GArguments extends readonly unknown[] = []> extends Flow<
  void,
  GValue,
  void,
  GArguments
> {
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
  ): ReadableFlow<GEvent, [options?: PushToPullOptions]> {
    return new ReadableFlow<GEvent, [options?: PushToPullOptions]>(async function* (
      { signal }: ReadableFlowContext,
      options?: PushToPullOptions,
    ): ReadableFlowIterator<GEvent> {
      signal.throwIfAborted();

      const [bridge, reader] = flowSyncBridge<GEvent>(signal, options);

      using _eventListener: Disposable = listen(target, type, (event: Event): void => {
        void bridge.write(event as GEvent);
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

  static override concat<GValue, GArguments extends readonly unknown[] = []>(
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

  static from<GValue>(input: ReadableFlowSource<GValue>): ReadableFlow<GValue, []> {
    if (input instanceof ReadableFlow) {
      return input;
    }

    if (isAsyncGeneratorFunction(input)) {
      return new ReadableFlow<GValue, []>(input);
    }

    if (Symbol.iterator in input) {
      return this.#fromIterable<GValue>(input);
    }

    if (Symbol.asyncIterator in input) {
      return this.#fromAsyncIterable<GValue>(input);
    }

    throw new TypeError('Invalid input.');
  }

  static #fromIterable<GValue>(input: Iterable<GValue>): ReadableFlow<GValue, []> {
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

  static #fromAsyncIterable<GValue>(input: AsyncIterable<GValue>): ReadableFlow<GValue, []> {
    return new ReadableFlow<GValue, []>(async function* (
      ctx: ReadableFlowContext,
    ): ReadableFlowIterator<GValue> {
      const iterator: AsyncIterator<GValue> = input[Symbol.asyncIterator]();

      try {
        while (true) {
          ctx.signal.throwIfAborted();

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

  /* ARGUMENTS */

  setArguments(
    ...args: GArguments
    // @ts-ignore
  ): ReadableFlow<GValue, []> {
    if (args.length === 0) {
      return this as unknown as ReadableFlow<GValue, []>;
    }

    const self: ReadableFlow<GValue, GArguments> = this;
    return new ReadableFlow<GValue, []>(async function* (
      ctx: ReadableFlowContext,
    ): ReadableFlowIterator<GValue> {
      yield* self.use(ctx, ...args);
    });
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
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
      ctx.signal.throwIfAborted();

      if (count <= 0) {
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
        yield* ReadableFlow.from<GNewValue>(flatMapFnc(value)).use(ctx);
      }
    });
  }

  /**
   * @experimental
   */
  loop(delay: number): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    return new ReadableFlow<GValue, GArguments>(async function* (
      ctx: ReadableFlowContext,
      ...args: GArguments
    ): ReadableFlowIterator<GValue> {
      while (true) {
        try {
          yield* self.use(ctx, ...args);
        } finally {
          await sleep(delay, { signal: ctx.signal });
        }
      }
    });
  }

  #fork: ReadableFlow<FlowForkedValue<GValue>, GArguments> | undefined;

  /**
   * @experimental
   */
  fork(): ReadableFlow<FlowForkedValue<GValue>, GArguments> {
    if (this.#fork === undefined) {
      const self: ReadableFlow<GValue, GArguments> = this;

      let sharedController: AbortController | undefined;
      let consumers: number = 0;
      let reader: FlowReader<GValue> | undefined;

      type PartialFlowForkedValue = Pick<FlowForkedValue<GValue>, 'value' | 'time' | 'index'>;

      const cachedQueries: Promise<IteratorResult<PartialFlowForkedValue, void>>[] = [];
      let closePromise: Promise<void> | undefined;

      this.#fork = new ReadableFlow<FlowForkedValue<GValue>, GArguments>(async function* (
        { signal }: ReadableFlowContext,
        ...args: GArguments
      ): ReadableFlowIterator<FlowForkedValue<GValue>> {
        signal.throwIfAborted();

        if (closePromise !== undefined) {
          await abortify(closePromise, { signal });
        }

        consumers++;

        try {
          if (consumers === 1) {
            sharedController = new AbortController();
            reader = self.open(sharedController.signal, ...args);
          }

          let index: number = 0;

          while (true) {
            if (index === cachedQueries.length) {
              // └> we are ahead

              const cachedQueryIndex: number = index;

              cachedQueries.push(
                reader!
                  .next()
                  .then(
                    (
                      result: IteratorResult<GValue, void>,
                    ): IteratorResult<PartialFlowForkedValue, void> => {
                      if (result.done) {
                        return result;
                      } else {
                        return {
                          done: false,
                          value: {
                            value: result.value,
                            time: Date.now(),
                            index: cachedQueryIndex,
                          } satisfies PartialFlowForkedValue,
                        };
                      }
                    },
                  ),
              );
            }

            const cachedQuery: Promise<IteratorResult<PartialFlowForkedValue, void>> =
              cachedQueries[index++];

            const result: IteratorResult<PartialFlowForkedValue, void> = await abortify(
              cachedQuery,
              { signal },
            );

            if (result.done) {
              return result.value;
            } else {
              yield {
                ...result.value,
                total: cachedQueries.length,
              };
            }
          }
        } finally {
          consumers--;

          if (consumers === 0) {
            sharedController!.abort(signal.reason);
            sharedController = undefined;
            cachedQueries.length = 0;

            const _reader: FlowReader<GValue> = reader!;
            try {
              const _closePromise = _reader.return();
              closePromise = _closePromise.then(
                () => {},
                () => {},
              );
              await _closePromise;
            } finally {
              closePromise = undefined;
              if (reader === _reader) {
                reader = undefined;
              }
            }
          }
        }
      });
    }

    return this.#fork;
  }

  /**
   * @experimental
   */
  edge(): ReadableFlow<GValue, GArguments> {
    return this.fork().mapFilter((forked: FlowForkedValue<GValue>): GValue | None => {
      return forked.index === forked.total - 1 ? forked.value : NONE;
    });
  }

  /* INSPECT THE FLOW */

  inspect(options: FlowInspectOptions<GValue> = {}): ReadableFlow<GValue, GArguments> {
    const self: ReadableFlow<GValue, GArguments> = this;

    const run = <GKey extends keyof FlowInspectOptions<GValue>>(
      key: GKey,
      ...args: Parameters<Required<FlowInspectOptions<GValue>>[GKey]>
    ): void => {
      const fnc: FlowInspectOptions<GValue>[GKey] | undefined = Reflect.get(options, key);
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
      run('open');

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
    predicate: FilterFunction<GValue>,
    signal: AbortSignal,
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
    predicate: FilterFunction<GValue>,
    signal: AbortSignal,
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
    reducer: ReduceFunction<GValue, GValue>,
    signal: AbortSignal,
    ...args: GArguments
  ): Promise<GValue>;
  reduce<GReducedValue extends GValue>(
    reducer: ReduceFunction<GValue, GReducedValue>,
    initialValue: GReducedValue,
    signal: AbortSignal,
    ...args: GArguments
  ): Promise<GReducedValue>;
  async reduce(reducer: ReduceFunction<any, any>, ...rest: any[]): Promise<any> {
    let accumulator: any;
    let accumulatorUninitialized: boolean;
    let signal: AbortSignal;
    let args: GArguments;

    if (rest[1] instanceof AbortSignal) {
      accumulatorUninitialized = false;
      accumulator = rest[0];
      signal = rest[1];
      args = rest.slice(2) as unknown as GArguments;
    } else {
      accumulatorUninitialized = true;
      signal = rest[0];
      args = rest.slice(1) as unknown as GArguments;
    }

    for await (const value of this.open(signal, ...args)) {
      if (accumulatorUninitialized) {
        accumulatorUninitialized = false;
        accumulator = value;
        continue;
      }

      accumulator = reducer(accumulator, value);
    }

    return accumulator;
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
