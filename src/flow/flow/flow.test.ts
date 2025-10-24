import { sleep } from '@xstd/abortable';
import { NONE } from '@xstd/none';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { Flow, FlowContext } from './flow.js';

describe('Flow', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  describe('constructor', () => {
    it('should accept a generator functions', async () => {
      const flow = new Flow<void, void, void, [first: number]>(async function* (
        _ctx: FlowContext<void, void>,
        first: number,
      ): AsyncGenerator<void, void, void> {
        expect(first).toBe(1);
      });

      expect(await flow.open(controller.signal, 1).next()).toEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('methods', () => {
    describe('open', () => {
      describe('arguments', () => {
        it('should receive arguments', async () => {
          const flow = new Flow<void, void, void, [first: number]>(async function* (
            _ctx: FlowContext<void, void>,
            first: number,
          ): AsyncGenerator<void, void, void> {
            expect(first).toBe(1);
          });

          expect(await flow.open(controller.signal, 1).next()).toEqual({
            done: true,
            value: undefined,
          });
        });
      });

      describe('next', () => {
        describe('output', () => {
          it('should emit a value', async () => {
            const flow = new Flow<void, number, void, []>(async function* (): AsyncGenerator<
              number,
              void,
              void
            > {
              yield 1;
            });

            expect(await flow.open(controller.signal).next()).toEqual({ done: false, value: 1 });
          });
        });

        describe('input', () => {
          it('should receive a value', async () => {
            const flow = new Flow<number, void, void, []>(async function* ({
              $next,
            }: FlowContext<number, void>): AsyncGenerator<void, void, void> {
              expect($next()).toBe(1);
            });

            expect(await flow.open(controller.signal).next(1)).toEqual({
              done: true,
              value: undefined,
            });
          });

          test('$next should not be accessible if "next" was not called', async () => {
            const flow = new Flow<number, void, void, []>(async function* ({
              $next,
            }: FlowContext<number, void>): AsyncGenerator<void, void, void> {
              try {
                expect($next()).toBe(1);
                yield;
              } finally {
                expect(() => $next()).toThrow();
              }
            });

            const reader = flow.open(controller.signal);

            expect(await reader.next(1)).toEqual({ done: false, value: undefined });
            expect(await reader.return()).toEqual({ done: true, value: undefined });
          });
        });
      });

      describe('throw', () => {
        it('should be catchable', async () => {
          const flow = new Flow<void, void, void, []>(async function* (): AsyncGenerator<
            void,
            void,
            void
          > {
            try {
              yield;
            } catch (error: unknown) {
              expect(error).toEqual('error');
            }
          });

          const reader = flow.open(controller.signal);

          expect(await reader.next()).toEqual({ done: false, value: undefined });
          expect(await reader.throw('error')).toEqual({ done: true, value: undefined });
        });
      });

      describe('return', () => {
        it('should return a value', async () => {
          const flow = new Flow<void, void, number, []>(async function* (): AsyncGenerator<
            void,
            number,
            void
          > {
            return 1;
          });

          expect(await flow.open(controller.signal).next()).toEqual({ done: true, value: 1 });
        });

        it('should obtain the return value', async () => {
          const flow = new Flow<void, void, number, []>(async function* ({
            $return,
          }: FlowContext<void, number>): AsyncGenerator<void, number, void> {
            try {
              yield;
              return 1;
            } finally {
              expect($return()).toEqual(2);
            }
          });

          const reader = flow.open(controller.signal);

          expect(await reader.next()).toEqual({ done: false, value: undefined });
          expect(await reader.return(2)).toEqual({ done: true, value: 2 });
        });

        test('$return should not be accessible if "return" was not called', async () => {
          const flow = new Flow<void, void, number, []>(async function* ({
            $return,
          }: FlowContext<void, number>): AsyncGenerator<void, number, void> {
            expect(() => $return()).toThrow();
            return 1;
          });

          const reader = flow.open(controller.signal);

          expect(await reader.next()).toEqual({ done: true, value: 1 });
        });
      });

      describe('iterable', () => {
        it('should be iterable', async () => {
          const data = [0, 1, 2];

          const flow = new Flow<void, number, void, []>(async function* ({
            signal,
          }: FlowContext<void, void>): AsyncGenerator<number, void, void> {
            for (const value of data) {
              await sleep(100, { signal });
              yield value;
            }
          });

          let i: number = 0;
          for await (const value of flow.open(controller.signal)) {
            expect(value).toBe(data[i++]);
          }
        });
      });

      describe('disposable', () => {
        it('should be disposable', async () => {
          let disposed: boolean = false;

          const flow = new Flow<void, void, void, []>(async function* (
            ctx: FlowContext<void, void>,
          ): AsyncGenerator<void, void, void> {
            try {
              yield;
            } finally {
              disposed = true;
              expect(ctx.$return()).toBe(NONE);
            }
          });

          const reader = flow.open(controller.signal);

          expect(await reader.next()).toEqual({ done: false, value: undefined });
          expect(disposed).toBe(false);

          await reader[Symbol.asyncDispose]();

          expect(disposed).toBe(true);
        });

        it("should fulfills when the flow throws signal's reason when disposing", async () => {
          let disposed: boolean = false;

          const flow = new Flow<void, void, void, []>(async function* (
            ctx: FlowContext<void, void>,
          ): AsyncGenerator<void, void, void> {
            try {
              yield;
            } finally {
              disposed = true;
              ctx.signal.throwIfAborted();
            }
          });

          const reader = flow.open(controller.signal);

          await expect(reader.next()).resolves.toEqual({ done: false, value: undefined });

          controller.abort('abort');

          await expect(reader[Symbol.asyncDispose]()).resolves.toBe(undefined);

          expect(disposed).toBe(true);
        });

        it('should rejects when the flow throws an error when disposing', async () => {
          const flow = new Flow<void, void, void, []>(async function* (): AsyncGenerator<
            void,
            void,
            void
          > {
            try {
              yield;
            } finally {
              throw 'error';
            }
          });

          const reader = flow.open(controller.signal);

          await expect(reader.next()).resolves.toEqual({ done: false, value: undefined });

          controller.abort('abort');

          await expect(reader[Symbol.asyncDispose]()).rejects.toThrow('error');
        });
      });

      describe('abortable', () => {
        it('should be abortable', async () => {
          const data = [0, 1, 2];

          const flow = new Flow<void, number, void, []>(async function* ({
            signal,
          }: FlowContext<void, void>): AsyncGenerator<number, void, void> {
            for (const value of data) {
              await sleep(100, { signal });
              yield value;
              signal.throwIfAborted();
              expect.unreachable();
            }
          });

          try {
            const controller = new AbortController();
            let i: number = 0;
            for await (const value of flow.open(controller.signal)) {
              controller.abort('abort');
              expect(value === data[i++]);
            }
            expect.unreachable();
          } catch (error: unknown) {
            expect(error).toBe('abort');
          }
        });
      });
    });

    describe('use', () => {
      it('should consume child flow', async () => {
        let nextValue: number | undefined = undefined;

        const reader = new Flow<number, void, void, []>(async function* (
          ctx: FlowContext<number, void>,
        ): AsyncGenerator<void, void, void> {
          yield* new Flow<number, void, void, []>(async function* (
            ctx: FlowContext<number, void>,
          ): AsyncGenerator<void, void, void> {
            nextValue = ctx.$next();
          }).use(ctx);
        }).open(controller.signal);

        expect(nextValue).toBe(undefined);

        await expect(reader.next(1)).resolves.toEqual({
          done: true,
          value: undefined,
        });

        expect(nextValue).toBe(1);
      });
    });
  });

  describe('warnings', () => {
    it('should warn if the signal is aborted while the flow is not actively iterating/pending', async () => {
      const spy = vi.spyOn(console, 'warn');
      vi.useFakeTimers();

      const reader = new Flow<void, number, void, []>(async function* (): AsyncGenerator<
        number,
        void,
        void
      > {
        yield 1;
        yield 2;
      }).open(controller.signal);

      expect(spy).toHaveBeenCalledTimes(0);

      await expect(reader.next()).resolves.toEqual({
        value: 1,
        done: false,
      });

      expect(spy).toHaveBeenCalledTimes(0);

      controller.abort('abort');

      vi.advanceTimersByTime(200);
      expect(spy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });

    it('should warn if the signal is aborted while the flow is actively iterating but it does not rejects', async () => {
      const spy = vi.spyOn(console, 'warn');

      const reader = new Flow<void, number, void, []>(async function* (): AsyncGenerator<
        number,
        void,
        void
      > {
        yield 1;
        yield 2;
      }).open(controller.signal);

      const promise = reader.next();

      expect(spy).toHaveBeenCalledTimes(0);

      controller.abort('abort');

      await expect(promise).resolves.toEqual({
        value: 1,
        done: false,
      });

      expect(spy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });

    it("should warn if the signal is aborted while the flow is actively iterating and it rejected with a reason different that the signal's reason", async () => {
      const spy = vi.spyOn(console, 'warn');

      const reader = new Flow<void, number, void, []>(async function* (): AsyncGenerator<
        number,
        void,
        void
      > {
        yield 1;
        throw 'error';
      }).open(controller.signal);

      expect(spy).toHaveBeenCalledTimes(0);

      await expect(reader.next()).resolves.toEqual({
        value: 1,
        done: false,
      });

      expect(spy).toHaveBeenCalledTimes(0);

      controller.abort('abort');

      expect(spy).toHaveBeenCalledTimes(0);

      await expect(reader.next()).rejects.toThrow('error');

      expect(spy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });
  });
});
