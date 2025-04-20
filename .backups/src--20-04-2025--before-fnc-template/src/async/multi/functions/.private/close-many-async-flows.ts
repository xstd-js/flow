import { AggregatedError } from '@xstd/custom-error';
import type { GenericAsyncFlow } from '../../../flow/flow/generic-async-flow.js';

/**
 * @deprecated
 */
export function closeManyAsyncFlows(
  asyncFlows: readonly GenericAsyncFlow[],
  reason?: unknown,
): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: (reason?: any) => void): void => {
    const total: number = asyncFlows.length;
    let done: number = 0;

    const errors: unknown[] = [];

    const allResolved = (): void => {
      if (errors.length > 0) {
        reject(AggregatedError.of(errors));
      } else {
        resolve();
      }
    };

    for (let i: number = 0; i < total; i++) {
      const asyncFlow: GenericAsyncFlow = asyncFlows[i];

      asyncFlow.close(reason).then(
        (): void => {
          done++;
          if (done === total) {
            allResolved();
          }
        },
        (error: unknown): void => {
          errors.push(error);

          done++;
          if (done === total) {
            allResolved();
          }
        },
      );
    }
  });
}
