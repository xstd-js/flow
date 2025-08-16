import { describe } from 'vitest';

describe('ReadableFlow', () => {
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

  describe.todo('static-methods', () => {});

  describe.todo('methods', () => {});
});
