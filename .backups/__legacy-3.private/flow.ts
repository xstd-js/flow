import { isAsyncGeneratorFunction } from '@xstd/async-generator';
import {
  FilterFunction,
  FilterFunctionWithSubType,
  MapFilterFunction,
  MapFunction,
} from '@xstd/functional';
import { PushToPullOptions } from '../shared/push-to-pull-options.js';
import { FlowSyncBridge } from './bridge/flow-sync-bridge.js';

export type FlowIterator<GValue> = AsyncGenerator<GValue, void, void>;

export interface FlowFactory<GValue> {
  (signal: AbortSignal): FlowIterator<GValue>;
}

export class Flow<GValue> {
  static when<GEvent extends Event>(
    target: EventTarget,
    type: string,
    options?: PushToPullOptions,
  ): Flow<GEvent> {
    return new Flow<GEvent>(async function* (signal: AbortSignal): FlowIterator<GEvent> {
      const bridge = new FlowSyncBridge<GEvent>(signal, options);

      target.addEventListener(
        type,
        (event: Event): void => {
          bridge.next(event as GEvent);
        },
        {
          signal,
        },
      );

      yield* bridge.reader;
    });
  }

  // static fromIterable<GValue>(iterable: Iterable<GValue>): Flow<GValue> {
  //   return new Flow<GValue>(async function* (
  //     signal: AbortSignal,
  //   ): AsyncGenerator<GValue, void, void> {
  //     const iterator: Iterator<GValue> = iterable[Symbol.iterator]();
  //     while (true) {
  //       signal.throwIfAborted();
  //       const result: IteratorResult<GValue, void> = iterator.next();
  //
  //       if (result.done) {
  //         return;
  //       }
  //
  //       yield result.value;
  //     }
  //   });
  // }

  readonly #factory: FlowFactory<GValue>;

  constructor(factory: FlowFactory<GValue>) {
    if (!isAsyncGeneratorFunction(factory)) {
      throw new TypeError('The factory must be an AsyncGenerator function.');
    }

    this.#factory = factory;
  }

  open(signal: AbortSignal): FlowIterator<GValue> {
    return this.#factory(signal);
  }

  /* TRANSFORM THE DATA */

  map<GNewValue>(mapFnc: MapFunction<GValue, GNewValue>): Flow<GNewValue> {
    const self: Flow<GValue> = this;
    return new Flow<GNewValue>(async function* (signal: AbortSignal): FlowIterator<GNewValue> {
      for await (const value of self.open(signal)) {
        yield mapFnc(value);
      }
    });
  }

  filter<GNewValue extends GValue>(
    filterFnc: FilterFunctionWithSubType<GValue, GNewValue>,
  ): Flow<GNewValue>;
  filter(filterFnc: FilterFunction<GValue>): Flow<GValue>;
  filter(filterFnc: FilterFunction<GValue>): Flow<GValue> {
    const self: Flow<GValue> = this;
    return new Flow<GValue>(async function* (signal: AbortSignal): FlowIterator<GValue> {
      for await (const value of self.open(signal)) {
        if (filterFnc(value)) {
          yield value;
        }
      }
    });
  }

  mapFilter<GNewValue>(filterFnc: MapFilterFunction<GValue, GNewValue>): Flow<GNewValue> {
    const self: Flow<GValue> = this;
    return new Flow<GNewValue>(async function* (signal: AbortSignal): FlowIterator<GNewValue> {
      for await (const value of self.open(signal)) {
        const newValue: GNewValue | null = filterFnc(value);
        if (newValue !== null) {
          yield newValue;
        }
      }
    });
  }

  /* TRUNCATE THE FLOW */

  take(count: number): Flow<GValue> {
    const self: Flow<GValue> = this;

    return new Flow<GValue>(async function* (signal: AbortSignal): FlowIterator<GValue> {
      for await (const value of self.open(signal)) {
        if (count <= 0) {
          return;
        }
        yield value;
        count--;
      }
    });
  }

  takeUntil(untilSource: Flow<any>): Flow<GValue> {
    const self: Flow<GValue> = this;

    return new Flow<GValue>(async function* (signal: AbortSignal): FlowIterator<GValue> {
      const untilPromise: Promise<IteratorResult<GValue, void>> = untilSource
        .open(signal)
        .next()
        .then((): IteratorResult<GValue, void> => {
          return {
            done: true,
            value: undefined,
          };
        });

      const reader: FlowIterator<GValue> = self.open(signal);

      let result: IteratorResult<GValue>;
      while (!(result = await Promise.race([reader.next(), untilPromise])).done) {
        yield result.value;
      }
    });
  }

  drop(count: number): Flow<GValue> {
    const self: Flow<GValue> = this;

    return new Flow<GValue>(async function* (signal: AbortSignal): FlowIterator<GValue> {
      for await (const value of self.open(signal)) {
        if (count > 0) {
          count--;
        } else {
          yield value;
        }
      }
    });
  }

  /* MISC */

  // share(): Flow<GValue> {
  //   const self: Flow<GValue> = this;
  //   let reader: FlowIterator<GValue> | undefined;
  //
  //   return new Flow<GValue>(async function* (signal: AbortSignal): FlowIterator<GValue> {
  //
  //     if (reader === undefined) {
  //       reader = self.open(signal);
  //     }
  //
  //     const reader: FlowIterator<GValue> = self.open(signal);
  //     let result: IteratorResult<GValue>;
  //     while (!(result = await reader.next()).done) {
  //       yield result.value;
  //     }
  //   });
  // }

  /* PROMISE-BASED RETURN */

  toArray(signal: AbortSignal): Promise<GValue[]> {
    return Array.fromAsync(this.open(signal));
  }

  async first(signal: AbortSignal): Promise<GValue> {
    await using reader: FlowIterator<GValue> = this.open(signal);

    const result: IteratorResult<GValue, void> = await reader.next();

    if (result.done) {
      throw new Error('Complete without sending a value.');
    }

    return result.value;
  }

  async last(signal: AbortSignal): Promise<GValue> {
    let lastValue: GValue;
    let hasValue: boolean = false;

    for await (const value of this.open(signal)) {
      lastValue = value;
      hasValue = true;
    }

    if (!hasValue) {
      throw new Error('Complete without sending a value.');
    }

    return lastValue!;
  }

  /* CAST TO OTHER KIND OF STREAMS */

  toReadableStream(): ReadableStream<GValue> {
    let reader: FlowIterator<GValue>;
    const controller: AbortController = new AbortController();

    return new ReadableStream<GValue>({
      start: (): void => {
        reader = this.open(controller.signal);
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
        controller.abort(reason);
        await reader.return(reason);
      },
    });
  }
}
