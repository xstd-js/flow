import { AggregatedError, type AggregatedErrorEntry } from '@xstd/custom-error';
import { removeDuplicateAbortSignalErrorFromErrors } from '../../../shared/functions/.private/remove-duplicate-abort-signal-error-from-errors.js';
import { ActiveResourceCollection } from '../../active-resource/collection/active-resource-collection.js';
import { ActiveResource } from '../../active-resource/active-resource.js';
import { SuspendedResource } from '../suspended-resource.js';

/* TYPES */

export type SuspendedResourceCollectionItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: SuspendedResource<any>;
};

// METHODS

// -> .open(...)

/**
 * Converts from a `SuspendedResourceCollectionItems` to a `ActiveResourceCollectionItems`.
 */
export type SuspendedResourceCollectionItemsToActiveResourceCollectionItems<
  GItems extends SuspendedResourceCollectionItems<GItems>,
> = {
  readonly [GKey in keyof GItems]: GItems[GKey] extends SuspendedResource<infer GHandle>
    ? GHandle
    : never;
};

// -> .mutate(...)

/**
 * A mutate function.
 */
export interface SuspendedResourceCollectionMutateFunction<
  GSelf extends SuspendedResourceCollection<any>,
  GNewItems extends SuspendedResourceCollectionItems<GNewItems>,
> {
  (self: GSelf): GNewItems;
}

/* CLASS */

/**
 * Represents a collection of `SuspendedResource` accessible through a named `key`.
 *
 * @experimental
 */
export class SuspendedResourceCollection<GItems extends SuspendedResourceCollectionItems<GItems>> {
  readonly #items: GItems;

  constructor(items: GItems) {
    this.#items = items;
  }

  /* ITEMS */

  get items(): GItems {
    return this.#items;
  }

  /* SUSPENDED RESOURCE LIKE */

  /**
   * Opens concurrently all the `SuspendedResource`.
   *
   * Awaits that **all** the `SuspendedResource` resolve (fulfilled or rejected), before this Promise is resolved.
   * In case or error(s), the given signal is aborted, opened `SuspendedResource` are closed,
   * the returned Promise rejects with these errors aggregated.
   */
  async open(
    signal?: AbortSignal,
  ): Promise<
    ActiveResourceCollection<SuspendedResourceCollectionItemsToActiveResourceCollectionItems<GItems>>
  > {
    type GActiveResourceCollectionItems =
      SuspendedResourceCollectionItemsToActiveResourceCollectionItems<GItems>;
    type GValue = ActiveResourceCollection<GActiveResourceCollectionItems>;

    return new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const controller: AbortController = new AbortController();
        const sharedSignal: AbortSignal =
          signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);

        let total: number = 0;
        let done: number = 0;

        const activeResourceMap: Record<string, ActiveResource> = {};
        const errors: AggregatedErrorEntry[] = [];

        const allResolved = (): void => {
          const filteredErrors: readonly unknown[] = removeDuplicateAbortSignalErrorFromErrors(
            sharedSignal,
            errors,
          );

          const activeResourceCollection = new ActiveResourceCollection<GActiveResourceCollectionItems>(
            activeResourceMap as GActiveResourceCollectionItems,
          );

          if (filteredErrors.length > 0) {
            const error: unknown = new AggregatedError({
              errors: filteredErrors,
            }).shorten();

            activeResourceCollection.close().then(
              (): void => {
                reject(error);
              },
              (_error: unknown): void => {
                reject(new SuppressedError(_error, error));
              },
            );
          } else {
            resolve(activeResourceCollection);
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

        for (const [key, suspendedResource] of Object.entries<SuspendedResource<any>>(this.#items)) {
          total++;
          suspendedResource.open(sharedSignal).then(
            (activeResource: ActiveResource): void => {
              activeResourceMap[key] = activeResource;
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
   * Applies a mutation on this `SuspendedResourceCollection` and returns another one.
   */
  mutate<GNewItems extends SuspendedResourceCollectionItems<GNewItems>>(
    mutateFnc: SuspendedResourceCollectionMutateFunction<this, GNewItems>,
  ): SuspendedResourceCollection<GNewItems> {
    return new SuspendedResourceCollection<GNewItems>(mutateFnc(this));
  }
}
