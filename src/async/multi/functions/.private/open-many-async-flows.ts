import { AggregatedError } from '@xstd/custom-error';
import { AsyncFlowFactory } from '../../../flow/factory/async-flow-factory.js';
import { GenericAsyncFlowFactory } from '../../../flow/factory/types/generic-async-flow-factory.js';
import type { GenericAsyncFlow } from '../../../flow/flow/generic-async-flow.js';
import { closeManyAsyncFlows } from './close-many-async-flows.js';

export type AsyncFlowFactoryOpenManyResult<
  GAsyncFlowFactories extends readonly AsyncFlowFactory<any>[],
> = {
  [GKey in keyof GAsyncFlowFactories]: GAsyncFlowFactories[GKey] extends AsyncFlowFactory<
    infer GAsyncFlow
  >
    ? GAsyncFlow
    : never;
};

/**
 * @deprecated
 */
export function openManyAsyncFlows<GAsyncFlowFactories extends readonly GenericAsyncFlowFactory[]>(
  asyncFlowFactories: GAsyncFlowFactories,
  signal?: AbortSignal,
): Promise<AsyncFlowFactoryOpenManyResult<GAsyncFlowFactories>> {
  type GValue = AsyncFlowFactoryOpenManyResult<GAsyncFlowFactories>;
  return new Promise<GValue>(
    (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
      signal?.throwIfAborted();

      if (asyncFlowFactories.length === 0) {
        return resolve([] as GValue);
      }

      const controller: AbortController = new AbortController();
      const sharedSignal: AbortSignal =
        signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);

      const total: number = asyncFlowFactories.length;
      let done: number = 0;
      const asyncFlows: GenericAsyncFlow[] = new Array(total);
      const errors: unknown[] = [];

      const allResolved = (): void => {
        const filteredErrors: unknown[] = sharedSignal.aborted
          ? [
              sharedSignal.reason,
              ...errors.filter((error: unknown): boolean => {
                return error !== sharedSignal.reason;
              }),
            ]
          : errors;

        if (filteredErrors.length > 0) {
          const error: unknown = AggregatedError.of(filteredErrors);

          closeManyAsyncFlows(
            asyncFlows.filter((item: GenericAsyncFlow | undefined): boolean => {
              return item !== undefined;
            }),
          ).then(
            (): void => {
              reject(error);
            },
            (_error: unknown): void => {
              reject(new SuppressedError(_error, error));
            },
          );
        } else {
          resolve(asyncFlows as GValue);
        }
      };

      for (let i: number = 0; i < total; i++) {
        const asyncFlowFactory: GenericAsyncFlowFactory = asyncFlowFactories[i];

        asyncFlowFactory.open(sharedSignal).then(
          (asyncFlow: GenericAsyncFlow): void => {
            asyncFlows[i] = asyncFlow;

            done++;
            if (done === total) {
              allResolved();
            }
          },
          (error: unknown): void => {
            errors.push(error);
            controller.abort();

            done++;
            if (done === total) {
              allResolved();
            }
          },
        );
      }
    },
  );
}
