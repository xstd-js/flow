import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Flow } from '../flow.js';
import { inspectFlow } from './inspect-flow.js';

describe('inspectFlow', () => {
  let controller: AbortController;

  beforeEach((): void => {
    controller = new AbortController();
  });

  it("should inspect the flow and logs it's state", async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation((): void => {});

    await expect(
      Flow.fromArray([0, 1, 2]).inspect(inspectFlow('test')).toArray(controller.signal),
    ).resolves.toEqual([0, 1, 2]);

    expect(spy).toHaveBeenCalledTimes(5);

    expect(spy.mock.calls[0][0].includes('OPEN')).toBe(true);

    expect(spy.mock.calls[1][0].includes('NEXT')).toBe(true);
    expect(spy.mock.calls[1][3]).toBe(0);

    expect(spy.mock.calls[2][0].includes('NEXT')).toBe(true);
    expect(spy.mock.calls[2][3]).toBe(1);

    expect(spy.mock.calls[3][0].includes('NEXT')).toBe(true);
    expect(spy.mock.calls[3][3]).toBe(2);

    expect(spy.mock.calls[4][0].includes('CLOSE')).toBe(true);

    vi.restoreAllMocks();
  });

  it('should support errors', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation((): void => {});

    await expect(
      Flow.thrown(() => 'error')
        .inspect(inspectFlow('test'))
        .toArray(controller.signal),
    ).rejects.toThrow('error');

    expect(spy).toHaveBeenCalledTimes(3);

    expect(spy.mock.calls[0][0].includes('OPEN')).toBe(true);

    expect(spy.mock.calls[1][0].includes('ERROR')).toBe(true);
    expect(spy.mock.calls[1][3]).toBe('error');

    expect(spy.mock.calls[2][0].includes('CLOSE')).toBe(true);

    vi.restoreAllMocks();
  });
});
