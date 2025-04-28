import { sleep } from '@xstd/async-task';
import { describe, expect, it, vi } from 'vitest';
import { AsyncFlow } from './async-flow.js';

describe('AsyncFlow', (): void => {
  it('should be closable', async (): Promise<void> => {
    const closeSpy = vi.fn();

    const flow: AsyncFlow<[], void> = new AsyncFlow<[], void>(() => {}, closeSpy);

    expect(closeSpy).toHaveBeenCalledTimes(0);
    expect(flow.closed).toBe(false);
    expect(() => flow.throwIfClosed()).not.toThrow();

    await flow.close('abort');

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenNthCalledWith(1, 'abort');
    expect(flow.closed).toBe(true);
    expect(() => flow.throwIfClosed()).toThrow();

    // ensures that more calls on `close` does not call `closeSpy` again
    await flow.close('abort');

    expect(closeSpy).toHaveBeenCalledTimes(1);

    await flow[Symbol.asyncDispose]();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('should queue .next(...)', async (): Promise<void> => {
    let nextCount: number = 0;

    const nextSpy = vi.fn(async (value: number): Promise<number> => {
      nextCount++;

      if (nextCount === 1) {
        expect(value).toBe(0);
        await sleep(10);
        return 0;
      } else {
        expect(value).toBe(1);
        return 1;
      }
    });

    const flow: AsyncFlow<[number], number> = new AsyncFlow<[number], number>(nextSpy);

    expect(nextSpy).toHaveBeenCalledTimes(0);

    let a_resolved: boolean = false;
    let b_resolved: boolean = false;

    // a
    flow.next(0).then((value: number): void => {
      a_resolved = true;
      expect(value).toBe(0);
      expect(b_resolved).toBe(false);
    });

    const b = flow.next(1).then((value: number): void => {
      b_resolved = true;
      expect(value).toBe(1);
      expect(a_resolved).toBe(true);
    });

    await b;

    expect(a_resolved).toBe(true);
    expect(b_resolved).toBe(true);

    expect(nextCount).toBe(2);
  });

  it("should abort next's signal when closed", async (): Promise<void> => {
    let signalAborted: unknown;

    const flow: AsyncFlow<[], void> = new AsyncFlow<[], void>(
      async (signal: AbortSignal): Promise<void> => {
        signal.addEventListener('abort', (): void => {
          signalAborted = signal.reason;
        });

        await sleep(100, signal);
      },
    );

    expect(signalAborted).not.toBeDefined();

    const a = flow.next();
    await sleep(10);
    await flow.close('abort');

    expect(signalAborted).toBe('abort');
    await expect(a).rejects.toBe('abort');
  });

  it('should queue .close(...)', async (): Promise<void> => {
    const closeSpy = vi.fn();

    const flow: AsyncFlow<[], void> = new AsyncFlow<[], void>(async (): Promise<void> => {
      await sleep(100);
    }, closeSpy);

    expect(closeSpy).toHaveBeenCalledTimes(0);

    let a_resolved: boolean = false;
    let b_resolved: boolean = false;

    // a
    flow.next().then((): void => {
      a_resolved = true;
      expect(b_resolved).toBe(false);
    });

    await sleep(10);

    const b = flow.close('abort').then((): void => {
      b_resolved = true;
      expect(a_resolved).toBe(true);
    });

    expect(closeSpy).toHaveBeenCalledTimes(0);

    await b;

    expect(a_resolved).toBe(true);
    expect(b_resolved).toBe(true);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenNthCalledWith(1, 'abort');
  });
});
