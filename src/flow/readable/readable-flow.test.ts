import { sleep } from '@xstd/abortable';
import { NONE } from '@xstd/none';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReadableFlow } from './readable-flow.js';

describe('ReadableFlow', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  // describe('generic behaviour', () => {
  //   it('should emit values', async () => {
  //     const data = [0, 1, 2];
  //
  //     const flow = new ReadableFlow<number>(async function* ({ signal }: ReadableFlowContext) {
  //       for (const value of data) {
  //         await sleep(100, { signal });
  //         yield value;
  //       }
  //     });
  //
  //     const controller = new AbortController();
  //     let i: number = 0;
  //     for await (const value of flow.open(controller.signal)) {
  //       expect(value === data[i++]);
  //     }
  //   });
  //
  //   it('should be abortable', async () => {
  //     const data = [0, 1, 2];
  //
  //     const flow = new ReadableFlow<number>(async function* ({ signal }: ReadableFlowContext) {
  //       for (const value of data) {
  //         await sleep(100, { signal });
  //         yield value;
  //         signal.throwIfAborted();
  //         expect.unreachable();
  //       }
  //     });
  //
  //     try {
  //       const controller = new AbortController();
  //       let i: number = 0;
  //       for await (const value of flow.open(controller.signal)) {
  //         controller.abort('abort');
  //         expect(value === data[i++]);
  //       }
  //       expect.unreachable();
  //     } catch (error: unknown) {
  //       expect(error).toBe('abort');
  //     }
  //   });
  // });

  describe('static-methods', () => {
    describe('when', () => {
      it('should receive event on the edge', async () => {
        const emitter = new EventTarget();

        const reader = ReadableFlow.when(emitter, 'event').open(controller.signal);

        const promise = reader.next();

        // await reader initialization
        await sleep(0);

        const event = new Event('event');
        emitter.dispatchEvent(event);
        emitter.dispatchEvent(new Event('event'));

        await expect(promise).resolves.toEqual({ done: false, value: event });
      });

      it('should cache last event', async () => {
        const emitter = new EventTarget();

        const reader = ReadableFlow.when(emitter, 'event').open(controller.signal, {
          retentionTime: 100,
        });

        const promise = reader.next();

        // await reader initialization
        await sleep(0);

        const eventA = new Event('event');
        emitter.dispatchEvent(eventA);

        const eventB = new Event('event');
        emitter.dispatchEvent(eventB);

        await sleep(200);

        const eventC = new Event('event');
        emitter.dispatchEvent(eventC);

        await expect(promise).resolves.toEqual({ done: false, value: eventA });
        await expect(reader.next()).resolves.toEqual({ done: false, value: eventC });
      });
    });

    // TODO others
  });

  describe('methods', () => {
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

    // describe.todo('fork', () => {
    //   it.todo('should works', async () => {});
    // });

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
  });
});
