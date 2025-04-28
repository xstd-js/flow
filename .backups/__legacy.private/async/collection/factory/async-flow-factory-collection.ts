import { AggregatedError, type AggregatedErrorEntry } from '@xstd/custom-error';
import { removeDuplicateAbortSignalErrorFromErrors } from '../../../helpers/.private/remove-duplicate-abort-signal-error-from-errors.js';
import { type AsyncFlowFactory } from '../../flow/factory/async-flow-factory.js';
import { type GenericAsyncFlowFactory } from '../../flow/factory/types/generic-async-flow-factory.js';
import { type GenericAsyncFlow } from '../../flow/flow/types/generic-async-flow.js';
import { AsyncFlowCollection } from '../flow/async-flow-collection.js';

/* TYPES */

export type AsyncFlowFactoryCollectionItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: GenericAsyncFlowFactory;
};

// METHODS

// -> .open(...)

/**
 * Converts from a `AsyncFlowFactoryCollectionItems` to a `AsyncFlowCollectionItems`.
 */
export type AsyncFlowFactoryCollectionItemsToAsyncFlowCollectionItems<
  GItems extends AsyncFlowFactoryCollectionItems<GItems>,
> = {
  readonly [GKey in keyof GItems]: GItems[GKey] extends AsyncFlowFactory<infer GAsyncFlow>
    ? GAsyncFlow
    : never;
};

// -> .mutate(...)

/**
 * A mutate function.
 */
export interface AsyncFlowFactoryCollectionMutateFunction<
  GSelf extends AsyncFlowFactoryCollection<any>,
  GNewItems extends AsyncFlowFactoryCollectionItems<GNewItems>,
> {
  (self: GSelf): GNewItems;
}

/* CLASS */

/**
 * Represents a collection of `AsyncFlowFactories` accessible through a named `key`.
 *
 * @experimental
 */
export class AsyncFlowFactoryCollection<GItems extends AsyncFlowFactoryCollectionItems<GItems>> {
  readonly #items: GItems;

  constructor(items: GItems) {
    this.#items = items;
  }

  /* ITEMS */

  get items(): GItems {
    return this.#items;
  }

  /* ASYNC FLOW FACTORY LIKE */

  /**
   * Opens concurrently all the `AsyncFlowFactories`.
   *
   * Awaits that **all** the `AsyncFlowFactories` resolve (fulfilled or rejected), before this Promise is resolved.
   * In case or error(s), the given signal is aborted, opened `AsyncFlowFactories` are closed,
   * the returned Promise rejects with these errors aggregated.
   */
  async open(
    signal?: AbortSignal,
  ): Promise<
    AsyncFlowCollection<AsyncFlowFactoryCollectionItemsToAsyncFlowCollectionItems<GItems>>
  > {
    type GMultiAsyncFlowItems = AsyncFlowFactoryCollectionItemsToAsyncFlowCollectionItems<GItems>;
    type GValue = AsyncFlowCollection<GMultiAsyncFlowItems>;

    return new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const controller: AbortController = new AbortController();
        const sharedSignal: AbortSignal =
          signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);

        let total: number = 0;
        let done: number = 0;

        const asyncFlowsMap: Record<string, GenericAsyncFlow> = {};
        const errors: AggregatedErrorEntry[] = [];

        const allResolved = (): void => {
          const filteredErrors: readonly unknown[] = removeDuplicateAbortSignalErrorFromErrors(
            sharedSignal,
            errors,
          );

          const multiAsyncFlow = new AsyncFlowCollection<GMultiAsyncFlowItems>(
            asyncFlowsMap as GMultiAsyncFlowItems,
          );

          if (filteredErrors.length > 0) {
            const error: unknown = new AggregatedError({
              errors: filteredErrors,
            }).shorten();

            multiAsyncFlow.close().then(
              (): void => {
                reject(error);
              },
              (_error: unknown): void => {
                reject(new SuppressedError(_error, error));
              },
            );
          } else {
            resolve(multiAsyncFlow);
          }
        };

        const checkAllResolved = (): void => {
          if (done === total) {
            allResolved();
          }
        };

        const resolveOne = (): void => {
          done++;
          checkAllResolved();
        };

        for (const [key, asyncFlowFactory] of Object.entries(this.#items)) {
          total++;
          (asyncFlowFactory as GenericAsyncFlowFactory).open(sharedSignal).then(
            (asyncFlow: GenericAsyncFlow): void => {
              asyncFlowsMap[key] = asyncFlow;
              resolveOne();
            },
            (error: unknown): void => {
              errors.push([key, error]);
              controller.abort();
              resolveOne();
            },
          );
        }

        checkAllResolved();
      },
    );
  }

  /**
   * Applies a mutation on this `MultiAsyncFlowFactory` and returns another one.
   */
  mutate<GNewItems extends AsyncFlowFactoryCollectionItems<GNewItems>>(
    mutateFnc: AsyncFlowFactoryCollectionMutateFunction<this, GNewItems>,
  ): AsyncFlowFactoryCollection<GNewItems> {
    return new AsyncFlowFactoryCollection<GNewItems>(mutateFnc(this));
  }
}
