import { sleep } from '@xstd/async-task';
import { listen } from '@xstd/disposable';
import {
  FilterFunction,
  FilterFunctionWithSubType,
  MapFilterFunction,
  MapFunction,
  ReduceFunction,
} from '@xstd/functional';
import { OptionalPushToPullOptions, PushToPullOptions } from '../../shared/push-to-pull-options.js';
import { flowSyncBridge } from '../bridge/flow-sync-bridge.js';
import { Flow, NoOptions } from '../flow/flow.js';
import { FlowReader } from './types/flow-reader.js';
import { FlowFlatMapFunction } from './types/methods/flat-map/flow-flat-map-function.js';
import { FlowInspectOptions } from './types/methods/inspect/flow-inspect-options.js';
import { ReadableFlowContext } from './types/readable-flow-context.js';
import { ReadableFlowIterator } from './types/readable-flow-iterator.js';

export class ReadableFlow<GValue, GOptions> extends Flow<void, GValue, void, GOptions> {
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
  ): ReadableFlow<GEvent, OptionalPushToPullOptions> {
    return new ReadableFlow<GEvent, OptionalPushToPullOptions>(async function* ({
      signal,
      options,
    }: ReadableFlowContext<OptionalPushToPullOptions>): ReadableFlowIterator<GEvent> {
      signal.throwIfAborted();

      const [bridge, reader] = flowSyncBridge<GEvent>(
        signal,
        options as PushToPullOptions | undefined,
      );

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

  static of<GValue>(...values: GValue[]): ReadableFlow<GValue, NoOptions> {
    return new ReadableFlow<GValue, NoOptions>(async function* (
      ctx: ReadableFlowContext<NoOptions>,
    ): ReadableFlowIterator<GValue> {
      for (let i: number = 0; i < values.length; i++) {
        ctx.signal.throwIfAborted();
        yield values[i];
      }
    });
  }

  static from<GValue>(
    input: Iterable<GValue> | AsyncIterable<GValue>,
  ): ReadableFlow<GValue, NoOptions> {
    if (Symbol.iterator in input) {
      return this.#fromIterable<GValue>(input);
    }

    if (Symbol.asyncIterator in input) {
      return this.#fromAsyncIterable<GValue>(input);
    }

    throw new TypeError('Invalid input.');
  }

  static #fromIterable<GValue>(input: Iterable<GValue>): ReadableFlow<GValue, NoOptions> {
    return new ReadableFlow<GValue, NoOptions>(async function* (
      ctx: ReadableFlowContext<NoOptions>,
    ): ReadableFlowIterator<GValue> {
      const iterator: Iterator<GValue> = input[Symbol.iterator]();

      try {
        while (true) {
          ctx.signal.throwIfAborted();

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

  static #fromAsyncIterable<GValue>(input: AsyncIterable<GValue>): ReadableFlow<GValue, NoOptions> {
    return new ReadableFlow<GValue, NoOptions>(async function* (
      ctx: ReadableFlowContext<NoOptions>,
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

  /* OPTIONS */

  setOptions(options: GOptions): ReadableFlow<GValue, NoOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;
    return new ReadableFlow<GValue, NoOptions>(async function* (
      ctx: ReadableFlowContext<NoOptions>,
    ): ReadableFlowIterator<GValue> {
      yield* self.adopt({
        ...ctx,
        options,
      });
    });
  }

  /* TRANSFORM */

  transform<GReturn>(transformFnc: MapFunction<this, GReturn>): GReturn {
    return transformFnc(this);
  }

  /* TRANSFORM THE DATA */

  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): ReadableFlow<GNewValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;
    return new ReadableFlow<GNewValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GNewValue> {
      for await (const value of self.adopt(ctx)) {
        yield mapFnc(value);
      }
    });
  }

  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): ReadableFlow<GNewValue, GOptions>;
  filter(filterFnc: FilterFunction<GValue>): ReadableFlow<GValue, GOptions>;
  filter(filterFnc: FilterFunction<GValue>): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;
    return new ReadableFlow<GValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GValue> {
      for await (const value of self.adopt(ctx)) {
        if (filterFnc(value)) {
          yield value;
        }
      }
    });
  }

  mapFilter<GNewValue>(
    filterFnc: MapFilterFunction<GValue, GNewValue>,
  ): ReadableFlow<GNewValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;
    return new ReadableFlow<GNewValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GNewValue> {
      for await (const value of self.adopt(ctx)) {
        const newValue: GNewValue | null = filterFnc(value);
        if (newValue !== null) {
          yield newValue;
        }
      }
    });
  }

  /* TRUNCATE THE FLOW */

  take(count: number): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

    return new ReadableFlow<GValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GValue> {
      ctx.signal.throwIfAborted();

      if (count <= 0) {
        return;
      }

      for await (const value of self.adopt(ctx)) {
        yield value;

        count--;

        if (count <= 0) {
          return;
        }
      }
    });
  }

  takeUntil(untilSource: ReadableFlow<any, NoOptions>): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

    return new ReadableFlow<GValue, GOptions>(async function* ({
      signal,
      options,
    }: ReadableFlowContext<GOptions>): ReadableFlowIterator<GValue> {
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

      await using reader: FlowReader<GValue> = self.open(sharedSignal, options);

      let result: IteratorResult<GValue>;
      while (!(result = await Promise.race([reader.next(), untilPromise])).done) {
        yield result.value;
      }

      controller.abort();
    });
  }

  drop(count: number): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

    return new ReadableFlow<GValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GValue> {
      for await (const value of self.adopt(ctx)) {
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
  ): ReadableFlow<GNewValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

    return new ReadableFlow<GNewValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GNewValue> {
      for await (const value of self.adopt(ctx)) {
        yield* flatMapFnc(value).adopt({
          ...ctx,
          options: undefined,
        });
      }
    });
  }

  /**
   * @experimental
   */
  loop(delay: number): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

    return new ReadableFlow<GValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GValue> {
      while (true) {
        try {
          yield* self.adopt(ctx);
        } catch (error: unknown) {
          await sleep(delay, ctx.signal);
        }
      }
    });
  }

  // #fork: ReadableFlow<FlowForkedValue<GValue>> | undefined;
  //
  // /**
  //  * @experimental
  //  */
  // fork(): ReadableFlow<FlowForkedValue<GValue>> {
  //   if (this.#fork === undefined) {
  //     const self: ReadableFlow<GValue> = this;
  //
  //     let sharedController: AbortController | undefined;
  //     let consumers: number = 0;
  //     let reader: FlowReader<GValue> | undefined;
  //
  //     type PartialFlowForkedValue = Pick<FlowForkedValue<GValue>, 'value' | 'time'>;
  //
  //     const cachedQueries: Promise<IteratorResult<PartialFlowForkedValue, void>>[] = [];
  //
  //     this.#fork = new ReadableFlow<FlowForkedValue<GValue>>(async function* (
  //       ctx: ReadableFlowContext,
  //     ): ReadableFlowIterator<FlowForkedValue<GValue>> {
  //       ctx.signal.throwIfAborted();
  //
  //       consumers++;
  //
  //       try {
  //         if (consumers === 1) {
  //           sharedController = new AbortController();
  //           reader = self.open(sharedController.signal);
  //         }
  //
  //         let index: number = 0;
  //
  //         while (true) {
  //           if (index === cachedQueries.length) {
  //             // └> we are ahead
  //
  //             cachedQueries.push(
  //               reader!
  //                 .next()
  //                 .then(
  //                   (
  //                     result: IteratorResult<GValue, void>,
  //                   ): IteratorResult<PartialFlowForkedValue, void> => {
  //                     if (result.done) {
  //                       return result;
  //                     } else {
  //                       return {
  //                         done: false,
  //                         value: {
  //                           value: result.value,
  //                           time: Date.now(),
  //                         } satisfies PartialFlowForkedValue,
  //                       };
  //                     }
  //                   },
  //                 ),
  //             );
  //           }
  //
  //           const cachedQuery: Promise<IteratorResult<PartialFlowForkedValue, void>> =
  //             cachedQueries[index++];
  //
  //           const result: IteratorResult<PartialFlowForkedValue, void> =
  //             await rejectPromiseWhenSignalIsAborted(cachedQuery, ctx.signal);
  //
  //           if (result.done) {
  //             return;
  //           } else {
  //             yield {
  //               ...result.value,
  //               isEdge: index === cachedQueries.length,
  //             };
  //           }
  //         }
  //       } finally {
  //         consumers--;
  //
  //         if (consumers === 0) {
  //           sharedController!.abort(ctx.signal.reason);
  //           sharedController = undefined;
  //           reader = undefined;
  //           cachedQueries.length = 0;
  //         }
  //       }
  //     });
  //   }
  //
  //   return this.#fork;
  // }
  //
  // /**
  //  * @experimental
  //  */
  // edge(): ReadableFlow<GValue, GOptions> {
  //   return this.fork().mapFilter((forked: FlowForkedValue<GValue>): GValue | null => {
  //     return forked.isEdge ? forked.value : null;
  //   });
  // }

  /* INSPECT THE FLOW */

  inspect(options: FlowInspectOptions<GValue> = {}): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

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

    return new ReadableFlow<GValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GValue> {
      run('open');

      try {
        for await (const value of self.adopt(ctx)) {
          run('next', value);
        }
      } catch (error: unknown) {
        run('error', error);
        throw error;
      } finally {
        run('close');
      }
    });
  }

  finally(finallyFnc: () => PromiseLike<void> | void): ReadableFlow<GValue, GOptions> {
    const self: ReadableFlow<GValue, GOptions> = this;

    return new ReadableFlow<GValue, GOptions>(async function* (
      ctx: ReadableFlowContext<GOptions>,
    ): ReadableFlowIterator<GValue> {
      try {
        yield* self.adopt(ctx);
      } finally {
        await finallyFnc();
      }
    });
  }

  /* PROMISE-BASED RETURN */

  toArray(signal: AbortSignal, options: GOptions): Promise<GValue[]> {
    return Array.fromAsync<GValue>(this.open(signal, options));
  }

  // TODO: forEach, find

  async some(
    predicate: FilterFunction<GValue>,
    signal: AbortSignal,
    options: GOptions,
  ): Promise<boolean> {
    for await (const value of this.open(signal, options)) {
      if (predicate(value)) {
        return true;
      }
    }
    return false;
  }

  async every(
    predicate: FilterFunction<GValue>,
    signal: AbortSignal,
    options: GOptions,
  ): Promise<boolean> {
    for await (const value of this.open(signal, options)) {
      if (!predicate(value)) {
        return false;
      }
    }
    return true;
  }

  reduce(
    reducer: ReduceFunction<GValue, GValue>,
    signal: AbortSignal,
    options: GOptions,
  ): Promise<GValue>;
  reduce<GReducedValue extends GValue>(
    reducer: ReduceFunction<GValue, GReducedValue>,
    initialValue: GReducedValue,
    signal: AbortSignal,
    options: GOptions,
  ): Promise<GReducedValue>;
  async reduce(reducer: ReduceFunction<any, any>, ...args: any[]): Promise<any> {
    let accumulator: any;
    let accumulatorUninitialized: boolean;
    let signal: AbortSignal;
    let options: GOptions;

    if (args[1] instanceof AbortSignal) {
      accumulatorUninitialized = false;
      accumulator = args[0];
      signal = args[1];
      options = args[2];
    } else {
      accumulatorUninitialized = true;
      signal = args[0];
      options = args[1];
    }

    for await (const value of this.open(signal, options)) {
      if (accumulatorUninitialized) {
        accumulatorUninitialized = false;
        accumulator = value;
        continue;
      }

      accumulator = reducer(accumulator, value);
    }

    return accumulator;
  }

  async first(signal: AbortSignal, options: GOptions): Promise<GValue> {
    await using reader: FlowReader<GValue> = this.open(signal, options);

    const result: IteratorResult<GValue, void> = await reader.next();

    if (result.done) {
      throw new Error('Complete without sending a value.');
    }

    return result.value;
  }

  async last(signal: AbortSignal, options: GOptions): Promise<GValue> {
    let lastValue: GValue;
    let hasValue: boolean = false;

    for await (const value of this.open(signal, options)) {
      lastValue = value;
      hasValue = true;
    }

    if (!hasValue) {
      throw new Error('Complete without sending a value.');
    }

    return lastValue!;
  }

  /* CAST TO OTHER KIND OF STREAMS */

  toReadableStream(options: GOptions): ReadableStream<GValue> {
    let reader: FlowReader<GValue>;
    const abortController: AbortController = new AbortController();

    return new ReadableStream<GValue>({
      start: (): void => {
        reader = this.open(abortController.signal, options);
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
