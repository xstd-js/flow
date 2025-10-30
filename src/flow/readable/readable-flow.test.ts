import { isResultErr, tryAsyncFnc, type ResultErr } from '@xstd/enum';
import { NONE } from '@xstd/none';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadableFlow } from './readable-flow.js';
import { type FlowReader } from './types/flow-reader.js';
import { type ReadableFlowContext } from './types/readable-flow-context.js';
import { type PushBridge } from './types/static-methods/from-push-source/push-bridge.js';

describe('ReadableFlow', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  describe('static-methods', () => {
    describe('fromPushSource', () => {
      describe('dataRetentionTime=0', () => {
        let bridge!: PushBridge<number>;
        let reader!: FlowReader<number>;

        beforeEach(() => {
          reader = ReadableFlow.fromPushSource<number>((_bridge: PushBridge<number>): void => {
            bridge = _bridge;
          }).open(controller.signal);
        });

        it('should init only after next is called and support abortion', async () => {
          expect(bridge).not.toBeDefined();

          const promise = reader.next();

          expect(bridge).toBeDefined();

          controller.abort('abort');

          await expect(promise).rejects.toThrow('abort');
        });

        it('should emit values', async () => {
          {
            const promise = reader.next();

            expect(bridge.signal.aborted).toBe(false);

            bridge.next(1);
            await expect(promise).resolves.toEqual({ done: false, value: 1 });
          }

          {
            bridge.next(2);

            const promise = reader.next();

            bridge.next(3);
            bridge.next(4);
            await expect(promise).resolves.toEqual({ done: false, value: 3 });
          }

          {
            const promise = reader.next();

            expect(bridge.signal.aborted).toBe(false);
            bridge.complete();
            expect(bridge.signal.aborted).toBe(true);

            await expect(promise).resolves.toEqual({ done: true, value: undefined });
          }
        });

        it('should support errors', async () => {
          {
            const promise = reader.next();

            expect(bridge.signal.aborted).toBe(false);

            bridge.next(1);
            await expect(promise).resolves.toEqual({ done: false, value: 1 });
          }

          {
            const promise = reader.next();

            expect(bridge.signal.aborted).toBe(false);
            bridge.error('error');
            expect(bridge.signal.aborted).toBe(true);

            await expect(promise).rejects.toThrow('error');
          }
        });
      });

      describe('dataRetentionTime=100', () => {
        let bridge!: PushBridge<number>;
        let reader!: FlowReader<number>;

        beforeEach(() => {
          reader = ReadableFlow.fromPushSource<number>((_bridge: PushBridge<number>): void => {
            bridge = _bridge;
          }).open(controller.signal, {
            dataRetentionTime: 100,
          });
        });

        it('should cache values for during the specified period', async () => {
          vi.useFakeTimers();

          {
            const promise = reader.next();

            bridge.next(1);
            bridge.next(2);

            await expect(promise).resolves.toEqual({ done: false, value: 1 });
            await expect(reader.next()).resolves.toEqual({ done: false, value: 2 });
          }

          {
            bridge.next(3);
            vi.advanceTimersByTime(200);
            bridge.next(4);

            await expect(reader.next()).resolves.toEqual({ done: false, value: 4 });
          }

          vi.restoreAllMocks();
        });
      });

      it('should support async init and disposal', async () => {
        let bridge!: PushBridge<number>;
        const deferred = vi.fn();

        const reader: FlowReader<number> = ReadableFlow.fromPushSource<number>(
          async (_bridge: PushBridge<number>): Promise<void> => {
            bridge = _bridge;
            _bridge.stack.defer(deferred);
          },
        ).open(controller.signal);

        {
          const promise = reader.next();
          expect(deferred).toHaveBeenCalledTimes(0);
          // wait until "init" resolved
          await Promise.resolve();
          bridge.next(1);
          await expect(promise).resolves.toEqual({ done: false, value: 1 });
        }

        {
          const promise = reader.next();
          expect(deferred).toHaveBeenCalledTimes(0);
          bridge.complete();
          await expect(promise).resolves.toEqual({ done: true, value: undefined });

          expect(deferred).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe('when', () => {
      it('should receive event on the edge', async () => {
        const emitter = new EventTarget();

        const reader = ReadableFlow.when(emitter, 'event').open(controller.signal);

        const promise = reader.next();

        const event = new Event('event');
        emitter.dispatchEvent(event);
        emitter.dispatchEvent(new Event('event'));

        await expect(promise).resolves.toEqual({ done: false, value: event });
      });

      it('should cache last event', async () => {
        vi.useFakeTimers();

        const emitter = new EventTarget();

        const reader = ReadableFlow.when(emitter, 'event').open(controller.signal, {
          dataRetentionTime: 100,
        });

        const promise = reader.next();

        const eventA = new CustomEvent('event', {
          detail: 'a',
        });
        emitter.dispatchEvent(eventA);

        const eventB = new CustomEvent('event', {
          detail: 'b',
        });
        emitter.dispatchEvent(eventB);

        // forces the promise loop to run
        await Promise.resolve();
        await Promise.resolve();

        vi.advanceTimersByTime(200);

        await Promise.resolve();

        const eventC = new CustomEvent('event', {
          detail: 'c',
        });
        emitter.dispatchEvent(eventC);

        await expect(promise).resolves.toEqual({ done: false, value: eventA });

        await expect(reader.next()).resolves.toEqual({ done: false, value: eventC });

        vi.restoreAllMocks();
      });
    });

    describe('concat', () => {
      it('should concat flows', async () => {
        expect(
          await ReadableFlow.concat(
            ReadableFlow.fromArray([0, 1, 2]),
            ReadableFlow.fromArray([3, 4]),
          ).toArray(controller.signal),
        ).toEqual([0, 1, 2, 3, 4]);
      });
    });

    describe('combine', () => {
      it('should combine array flows', async () => {
        expect(
          await ReadableFlow.combine([
            ReadableFlow.fromArray([0, 1, 2]),
            ReadableFlow.fromArray([3, 4]),
          ]).toArray(controller.signal),
        ).toEqual([
          [0, 3],
          [1, 4],
          [2, 4],
        ]);
      });

      it('should combine record flows', async () => {
        expect(
          await ReadableFlow.combine({
            a: ReadableFlow.fromArray([0, 1, 2]),
            b: ReadableFlow.fromArray([3, 4]),
          }).toArray(controller.signal),
        ).toEqual([
          { a: 0, b: 3 },
          { a: 1, b: 4 },
          { a: 2, b: 4 },
        ]);
      });

      it('should rejects with the corresponding error then disposed with error', async () => {
        const flow = ReadableFlow.combine([
          new ReadableFlow(async function* () {
            try {
              yield 0;
            } finally {
              throw 'error';
            }
          }),
          ReadableFlow.fromArray([3, 4]),
        ]).open(controller.signal);

        await expect(flow.next()).resolves.toEqual({
          done: false,
          value: [0, 3],
        });

        await expect(flow[Symbol.asyncDispose]()).rejects.toThrow('error');
      });

      it('should rejects with the corresponding error aggregation then disposed with error', async () => {
        const flow = ReadableFlow.combine([
          new ReadableFlow<number, []>(async function* () {
            try {
              yield 0;
            } finally {
              throw 'error0';
            }
          }),
          new ReadableFlow<number, []>(async function* () {
            try {
              yield 1;
            } finally {
              throw 'error1';
            }
          }),
        ]).open(controller.signal);

        await expect(flow.next()).resolves.toEqual({
          done: false,
          value: [0, 1],
        });

        const result = await tryAsyncFnc(flow[Symbol.asyncDispose]);
        expect(isResultErr(result)).toBe(true);
        expect((result as ResultErr).error).instanceOf(AggregateError);
        expect(((result as ResultErr).error as AggregateError).errors).toEqual([
          'error0',
          'error1',
        ]);
      });

      it('should rejects if a flow completes without sendint a value', async () => {
        const flow = ReadableFlow.combine([
          new ReadableFlow<number, []>(async function* () {}),
          ReadableFlow.fromArray([3, 4]),
        ]).open(controller.signal);

        await expect(flow.next()).rejects.toThrow();
      });
    });

    describe('of', () => {
      it('should return expected values', async () => {
        expect(await ReadableFlow.of(0, 1, 2).toArray(controller.signal)).toEqual([0, 1, 2]);
      });
    });

    describe('fromPromiseFactory', () => {
      it('should return expected values', async () => {
        expect(
          await ReadableFlow.fromPromiseFactory(() => Promise.resolve(1)).toArray(
            controller.signal,
          ),
        ).toEqual([1]);
      });

      it('should support rejected promise', async () => {
        const error = new Error();

        await expect(
          ReadableFlow.fromPromiseFactory(() => Promise.reject(error)).toArray(controller.signal),
        ).rejects.toThrow(error);
      });
    });

    describe('fromIterable', () => {
      it('should return expected values', async () => {
        expect(
          await ReadableFlow.fromIterable(new Set([0, 1, 2])).toArray(controller.signal),
        ).toEqual([0, 1, 2]);
      });

      it('should support throw', async () => {
        let caught: unknown = NONE;

        const reader = ReadableFlow.fromIterable<void>(
          (function* (): Generator<void, void, void> {
            try {
              yield;
            } catch (error: unknown) {
              caught = error;
              throw error;
            }
          })(),
        ).open(controller.signal);

        await expect(reader.next()).resolves.toEqual({ value: undefined, done: false });
        const error = new Error();
        await expect(reader.throw(error)).rejects.toBe(error);
        expect(caught).toBe(error);
      });

      it('should support undefined throw', async () => {
        const reader = ReadableFlow.fromIterable<void>({
          [Symbol.iterator]: () => {
            return {
              next: () => ({ value: undefined, done: false }),
            };
          },
        }).open(controller.signal);

        await expect(reader.next()).resolves.toEqual({ value: undefined, done: false });
        const error = new Error();
        await expect(reader.throw(error)).rejects.toBe(error);
      });
    });

    describe('fromAsyncIterable', () => {
      it('should return expected values', async () => {
        expect(
          await ReadableFlow.fromAsyncIterable(
            (async function* () {
              yield* [0, 1, 2];
            })(),
          ).toArray(controller.signal),
        ).toEqual([0, 1, 2]);
      });

      it('should support throw', async () => {
        let caught: unknown = NONE;

        const reader = ReadableFlow.fromAsyncIterable<void>(
          (async function* (): AsyncGenerator<void, void, void> {
            try {
              yield;
            } catch (error: unknown) {
              caught = error;
              throw error;
            }
          })(),
        ).open(controller.signal);

        await expect(reader.next()).resolves.toEqual({ value: undefined, done: false });
        const error = new Error();
        await expect(reader.throw(error)).rejects.toBe(error);
        expect(caught).toBe(error);
      });

      it('should support undefined throw', async () => {
        const reader = ReadableFlow.fromAsyncIterable<void>({
          [Symbol.asyncIterator]: () => {
            return {
              next: () => Promise.resolve({ value: undefined, done: false }),
            };
          },
        }).open(controller.signal);

        await expect(reader.next()).resolves.toEqual({ value: undefined, done: false });
        const error = new Error();
        await expect(reader.throw(error)).rejects.toBe(error);
      });
    });

    describe('fromArray', () => {
      it('should return expected values', async () => {
        expect(await ReadableFlow.fromArray([0, 1, 2]).toArray(controller.signal)).toEqual([
          0, 1, 2,
        ]);
      });
    });

    describe('thrown', () => {
      it('should throw', async () => {
        const error = new Error();

        await expect(
          ReadableFlow.thrown(() => error)
            .open(controller.signal)
            .next(),
        ).rejects.toThrow(error);
      });
    });
  });

  describe('methods', () => {
    describe('transform', () => {
      it('should map values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2])
            .transform((flow) => flow.map((value) => value * 2))
            .toArray(controller.signal),
        ).toEqual([0, 2, 4]);
      });
    });

    describe('setArguments', () => {
      it('should fix arguments', async () => {
        expect(
          await new ReadableFlow(async function* (
            _ctx: ReadableFlowContext,
            input: number,
          ): AsyncGenerator<number, void, void> {
            yield input;
          })
            .setArguments(10)
            .toArray(controller.signal),
        ).toEqual([10]);
      });
    });

    describe('map', () => {
      it('should map values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2])
            .map((value) => value * 2)
            .toArray(controller.signal),
        ).toEqual([0, 2, 4]);
      });
    });

    describe('filter', () => {
      it('should filter values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2])
            .filter((value) => value > 0)
            .toArray(controller.signal),
        ).toEqual([1, 2]);
      });
    });

    describe('mapFilter', () => {
      it('should map and filter values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2])
            .mapFilter((value) => (value > 0 ? value * 2 : NONE))
            .toArray(controller.signal),
        ).toEqual([2, 4]);
      });
    });

    describe('distinct', () => {
      it('should emit only distinct values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 1, 2]).distinct().toArray(controller.signal),
        ).toEqual([0, 1, 2]);
      });
    });

    describe('take', () => {
      it('should take only 2 values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).take(2).toArray(controller.signal),
        ).toEqual([0, 1]);
      });

      it('should accept 0 or less', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).take(0).toArray(controller.signal),
        ).toEqual([]);
      });
    });

    describe('takeUntil', () => {
      it('should take values until sub flow completes', async () => {
        let bridge!: PushBridge<void>;

        const reader: FlowReader<number> = ReadableFlow.fromArray<number>([0, 1, 2])
          .takeUntil(
            ReadableFlow.fromPushSource<void>((_bridge: PushBridge<void>): void => {
              bridge = _bridge;
            }).setArguments({
              dataRetentionTime: 100,
            }),
          )
          .open(controller.signal);

        await expect(reader.next()).resolves.toEqual({ done: false, value: 0 });
        expect(bridge).toBeDefined();

        bridge.complete();

        // NOTE because the `until` flow resolves at the same time as the `main` flow, the `main`'s flow value is returned.
        await expect(reader.next()).resolves.toEqual({ done: false, value: 1 });

        await expect(reader.next()).resolves.toEqual({ done: true, value: undefined });
      });
    });

    describe('drop', () => {
      it('should drop 1 value', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).drop(1).toArray(controller.signal),
        ).toEqual([1, 2]);
      });

      it('should accept 0 or less', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).drop(0).toArray(controller.signal),
        ).toEqual([0, 1, 2]);
      });
    });

    describe('flatMap', () => {
      it('should chain ReadableFlows', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2])
            .flatMap((value: number): ReadableFlow<number> => {
              return ReadableFlow.fromIterable([value * 2, value * 3]);
            })
            .toArray(controller.signal),
        ).toEqual([0, 0, 2, 3, 4, 6]);
      });
    });

    describe('fork', () => {
      describe('maintainAlive=0', () => {
        it('should share emitted values', async () => {
          let bridge!: PushBridge<number>;
          let count: number = 0;

          const flow: ReadableFlow<number> = ReadableFlow.fromPushSource<number>(
            (_bridge: PushBridge<number>): void => {
              count++;
              bridge = _bridge;

              _bridge.signal.addEventListener('abort', () => {
                count--;
              });
            },
          ).fork();

          const a = flow.open(controller.signal);
          expect(count).toBe(0);

          {
            const promise = a.next();
            expect(count).toBe(1);
            bridge.next(1);
            await expect(promise).resolves.toEqual({ value: 1, done: false });
          }

          const b = flow.open(controller.signal);

          {
            const promiseA = a.next();
            const promiseB = b.next();
            expect(count).toBe(1);
            bridge.next(2);
            await expect(promiseA).resolves.toEqual({ value: 2, done: false });
            await expect(promiseB).resolves.toEqual({ value: 2, done: false });
          }

          {
            const promiseA = a.next();
            const promiseB = b.next();
            expect(count).toBe(1);
            bridge.complete();
            await expect(promiseA).resolves.toEqual({ value: undefined, done: true });
            await expect(promiseB).resolves.toEqual({ value: undefined, done: true });
          }

          expect(count).toBe(0);
        });
      });

      describe('maintainAlive=10', () => {
        it('should share emitted values', async () => {
          vi.stubGlobal('reportError', () => {});
          vi.useFakeTimers();

          let bridge!: PushBridge<number>;
          let count: number = 0;
          let disposed: number = 0;

          const flow: ReadableFlow<number> = ReadableFlow.fromPushSource<number>(
            (_bridge: PushBridge<number>): void => {
              count++;
              bridge = _bridge;

              bridge.stack.defer(() => {
                disposed++;
              });
            },
          ).fork({
            maintainAlive: 10,
          });

          const a = flow.open(controller.signal);
          expect(count).toBe(0);

          {
            const promise = a.next();

            expect(count).toBe(1);
            expect(disposed).toBe(0);

            bridge.complete();
            await expect(promise).resolves.toEqual({ value: undefined, done: true });

            expect(count).toBe(1);
            expect(disposed).toBe(1);
          }

          const b = flow.open(controller.signal);

          {
            const promise = b.next();

            expect(count).toBe(1);
            expect(disposed).toBe(1);

            await expect(promise).resolves.toEqual({ value: undefined, done: true });

            expect(count).toBe(1);
            expect(disposed).toBe(1);
          }

          vi.advanceTimersByTime(20);

          await Promise.resolve();

          vi.restoreAllMocks();
        });
      });

      it('should wait for any previous disposal', async () => {
        let bridge!: PushBridge<number>;
        let count: number = 0;
        const deferred = Promise.withResolvers<void>();

        const flow: ReadableFlow<number> = ReadableFlow.fromPushSource<number>(
          (_bridge: PushBridge<number>): void => {
            count++;
            bridge = _bridge;

            _bridge.stack.defer(() => {
              count--;
              return deferred.promise;
            });
          },
        ).fork();

        const a = flow.open(controller.signal);

        {
          const promise = a.next();
          expect(count).toBe(1);
          bridge.next(1);
          await expect(promise).resolves.toEqual({ value: 1, done: false });
        }

        const b = flow.open(new AbortController().signal);

        {
          const promiseA = a.next();
          expect(count).toBe(1);
          controller.abort();
          expect(count).toBe(1);

          // wait start of disposal
          await Promise.resolve();

          const promiseB = b.next();

          deferred.resolve();
          expect(count).toBe(1);

          await expect(promiseA).rejects.toThrow();
          expect(count).toBe(1);

          bridge.next(2);

          await expect(promiseB).resolves.toEqual({ value: 2, done: false });
          expect(count).toBe(1);
        }

        {
          const promiseB = b.next();

          bridge.complete();
          await expect(promiseB).resolves.toEqual({ value: undefined, done: true });
          expect(count).toBe(0);
        }
      });
    });

    describe('inspect', () => {
      it('should accept empty argument', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1]).inspect().toArray(controller.signal),
        ).toEqual([0, 1]);
      });

      it("should hook flow's state", async () => {
        const open = vi.fn();
        const next = vi.fn();
        const error = vi.fn();
        const close = vi.fn();

        expect(
          await ReadableFlow.fromIterable([0, 1])
            .inspect({
              open,
              next,
              error,
              close,
            })
            .toArray(controller.signal),
        ).toEqual([0, 1]);

        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenNthCalledWith(1);

        expect(next).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenNthCalledWith(1, 0);
        expect(next).toHaveBeenNthCalledWith(2, 1);

        expect(error).toHaveBeenCalledTimes(0);

        expect(close).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenNthCalledWith(1);
      });

      it('should support errors', async () => {
        const _error = new Error();
        const error = vi.fn();

        await expect(
          ReadableFlow.thrown(() => _error)
            .inspect({
              error,
            })
            .toArray(controller.signal),
        ).rejects.toThrow(_error);

        expect(error).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenNthCalledWith(1, _error);
      });

      it('should report errors', async () => {
        const _error = new Error();

        vi.stubGlobal('reportError', () => {});

        const reportError = vi.spyOn(globalThis, 'reportError');

        expect(
          await ReadableFlow.fromIterable([0, 1])
            .inspect({
              open: () => {
                throw _error;
              },
            })
            .toArray(controller.signal),
        ).toEqual([0, 1]);

        expect(reportError).toHaveBeenCalledTimes(1);
        expect(reportError).toHaveBeenNthCalledWith(1, _error);

        vi.restoreAllMocks();
      });
    });

    describe('catch', () => {
      it('should be called when the flow errors', async () => {
        const spy = vi.fn();
        expect(
          await ReadableFlow.thrown(() => 'error')
            .catch((error: unknown) => {
              spy(error);
              return ReadableFlow.fromIterable([0, 1, 2]);
            })
            .toArray(controller.signal),
        ).toEqual([0, 1, 2]);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenNthCalledWith(1, 'error');
      });
    });

    describe('finally', () => {
      it('should be called when the flow ends', async () => {
        const spy = vi.fn();
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).finally(spy).toArray(controller.signal),
        ).toEqual([0, 1, 2]);

        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    describe('toArray', () => {
      it('should returns the expected value', async () => {
        expect(await ReadableFlow.fromIterable([0, 1, 2]).toArray(controller.signal)).toEqual([
          0, 1, 2,
        ]);
      });
    });

    describe('first', () => {
      it('should return the first value', async () => {
        let disposed: boolean = false;

        const flow = new ReadableFlow<number>(async function* (): AsyncGenerator<
          number,
          void,
          void
        > {
          try {
            yield 1;
            expect.unreachable();
          } finally {
            disposed = true;
          }
        });

        expect(await flow.first(controller.signal)).toBe(1);
        expect(disposed).toBe(true);
      });

      it('should throw when there is no value', async () => {
        let disposed: boolean = false;

        const flow = new ReadableFlow<number>(async function* (): AsyncGenerator<
          number,
          void,
          void
        > {
          disposed = true;
        });

        await expect(flow.first(controller.signal)).rejects.toThrow();
        expect(disposed).toBe(true);
      });
    });

    describe('last', () => {
      it('should return the last value', async () => {
        let disposed: boolean = false;

        const flow = new ReadableFlow<number>(async function* (): AsyncGenerator<
          number,
          void,
          void
        > {
          try {
            yield 1;
            yield 2;
          } finally {
            disposed = true;
          }
        });

        expect(await flow.last(controller.signal)).toBe(2);
        expect(disposed).toBe(true);
      });

      it('should throw when there is no value', async () => {
        let disposed: boolean = false;

        const flow = new ReadableFlow<number>(async function* (): AsyncGenerator<
          number,
          void,
          void
        > {
          disposed = true;
        });

        await expect(flow.last(controller.signal)).rejects.toThrow();
        expect(disposed).toBe(true);
      });
    });

    describe('forEach', () => {
      it('iterates over all the values', async () => {
        const spy = vi.fn();

        await expect(
          ReadableFlow.fromIterable([0, 1, 2]).forEach(controller.signal, spy),
        ).resolves.not.toThrow();

        expect(spy).toHaveBeenCalledTimes(3);
        expect(spy).toHaveBeenNthCalledWith(1, 0, controller.signal);
        expect(spy).toHaveBeenNthCalledWith(2, 1, controller.signal);
        expect(spy).toHaveBeenNthCalledWith(3, 2, controller.signal);
      });
    });

    describe('some', () => {
      it('accepts one value', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).some(controller.signal, (v) => v === 1),
        ).toBe(true);
      });

      it('rejects all values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).some(controller.signal, (v) => v === 4),
        ).toBe(false);
      });

      it('supports no data', async () => {
        expect(await ReadableFlow.fromIterable([]).some(controller.signal, (v) => v === 4)).toBe(
          false,
        );
      });
    });

    describe('every', () => {
      it('accepts every values', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).every(controller.signal, (v) => v !== -4),
        ).toBe(true);
      });

      it('rejects one value', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).every(controller.signal, (v) => v !== 2),
        ).toBe(false);
      });

      it('supports no data', async () => {
        expect(await ReadableFlow.fromIterable([]).every(controller.signal, (v) => v === 4)).toBe(
          true,
        );
      });
    });

    describe('reduce', () => {
      it('performs the sum of data', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).reduce<number>(
            controller.signal,
            (sum, v) => sum + v,
            0,
          ),
        ).toBe(3);

        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).reduce(
            controller.signal,
            (sum, v) => sum + v,
            NONE,
          ),
        ).toBe(3);
      });
    });

    describe('find', () => {
      it('should return a value if the value exists', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).find<number>(
            controller.signal,
            (value: number) => value === 1,
          ),
        ).toBe(1);
      });

      it('should return undefined if the value does not exist', async () => {
        expect(
          await ReadableFlow.fromIterable([0, 1, 2]).find<number>(
            controller.signal,
            (value: number) => value === 3,
          ),
        ).toBe(undefined);
      });
    });

    describe('toReadableStream', () => {
      it('should emit expected values', async () => {
        const stream = ReadableFlow.fromArray([0, 1, 2]).toReadableStream();
        await expect(Array.fromAsync(stream as unknown as AsyncIterable<number>)).resolves.toEqual([
          0, 1, 2,
        ]);
      });

      it('should support errors', async () => {
        const stream = ReadableFlow.thrown<number>(() => 'error').toReadableStream();
        await expect(Array.fromAsync(stream as unknown as AsyncIterable<number>)).rejects.toThrow(
          'error',
        );
      });

      it('should support cancellation', async () => {
        const stream = ReadableFlow.fromArray([0, 1, 2]).toReadableStream();

        const reader = stream.getReader();

        await expect(reader.read()).resolves.toEqual({ done: false, value: 0 });

        await reader.cancel('abort');

        await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
      });
    });
  });
});
