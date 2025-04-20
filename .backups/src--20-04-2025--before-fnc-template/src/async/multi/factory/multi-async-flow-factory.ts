import { AggregatedError } from '@xstd/custom-error';
import { removeDuplicateAbortSignalErrorFromErrors } from '../../../helpers/.private/remove-duplicate-abort-signal-error-from-errors.js';
import { type AsyncFlowFactory } from '../../flow/factory/async-flow-factory.js';
import { type GenericAsyncFlowFactory } from '../../flow/factory/types/generic-async-flow-factory.js';
import { type GenericAsyncFlow } from '../../flow/flow/generic-async-flow.js';
import { MultiAsyncFlow } from '../flow/multi-async-flow.js';

/* TYPES */

export type MultiAsyncFlowFactoryItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: GenericAsyncFlowFactory;
};

// METHODS

// -> .open(...)

/**
 * Converts from a `MultiAsyncFlowFactoryItems` to a `MultiAsyncFlowItems`.
 */
export type MultiAsyncFlowFactoryItemsToMultiAsyncFlowItems<
  GItems extends MultiAsyncFlowFactoryItems<GItems>,
> = {
  readonly [GKey in keyof GItems]: GItems[GKey] extends AsyncFlowFactory<infer GAsyncFlow>
    ? GAsyncFlow
    : never;
};

// -> .mutate(...)

/**
 * A mutate function.
 */
export interface MultiAsyncFlowFactoryMutateFunction<
  GSelf extends MultiAsyncFlowFactory<any>,
  GNewItems extends MultiAsyncFlowFactoryItems<GNewItems>,
> {
  (self: GSelf): GNewItems;
}

/* CLASS */

/**
 * Represents a collection of `AsyncFlowFactories` accessible through a named `key`.
 *
 * @experimental
 */
export class MultiAsyncFlowFactory<GItems extends MultiAsyncFlowFactoryItems<GItems>> {
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
  ): Promise<MultiAsyncFlow<MultiAsyncFlowFactoryItemsToMultiAsyncFlowItems<GItems>>> {
    type GMultiAsyncFlowItems = MultiAsyncFlowFactoryItemsToMultiAsyncFlowItems<GItems>;
    type GValue = MultiAsyncFlow<GMultiAsyncFlowItems>;

    return new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const controller: AbortController = new AbortController();
        const sharedSignal: AbortSignal =
          signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);

        let total: number = 0;
        let done: number = 0;

        const asyncFlowsMap: Record<string, GenericAsyncFlow> = {};
        const errors: unknown[] = [];

        const allResolved = (): void => {
          const filteredErrors: readonly unknown[] = removeDuplicateAbortSignalErrorFromErrors(
            sharedSignal,
            errors,
          );

          const multiAsyncFlow = new MultiAsyncFlow<GMultiAsyncFlowItems>(
            asyncFlowsMap as GMultiAsyncFlowItems,
          );

          if (filteredErrors.length > 0) {
            const error: unknown = AggregatedError.of(filteredErrors);

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
              errors.push(error);
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
  mutate<GNewItems extends MultiAsyncFlowFactoryItems<GNewItems>>(
    mutateFnc: MultiAsyncFlowFactoryMutateFunction<this, GNewItems>,
  ): MultiAsyncFlowFactory<GNewItems> {
    return new MultiAsyncFlowFactory<GNewItems>(mutateFnc(this));
  }
}
