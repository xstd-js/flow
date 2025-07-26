import { AggregatedError, type AggregatedErrorEntry } from '@xstd/custom-error';
import { HandleCollection } from '../../handle/collection/handle-collection.js';
import { Handle } from '../../handle/handle.js';
import { removeDuplicateAbortSignalErrorFromErrors } from '../../shared/functions/.private/remove-duplicate-abort-signal-error-from-errors.js';
import { Gate } from '../gate.js';

/* TYPES */

export type GateCollectionItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: Gate<any>;
};

// METHODS

// -> .open(...)

/**
 * Converts from a `GateCollectionItems` to a `HandleCollectionItems`.
 */
export type GateCollectionItemsToHandleCollectionItems<GItems extends GateCollectionItems<GItems>> =
  {
    readonly [GKey in keyof GItems]: GItems[GKey] extends Gate<infer GHandle> ? GHandle : never;
  };

// -> .mutate(...)

/**
 * A mutate function.
 */
export interface GateCollectionMutateFunction<
  GSelf extends GateCollection<any>,
  GNewItems extends GateCollectionItems<GNewItems>,
> {
  (self: GSelf): GNewItems;
}

/* CLASS */

/**
 * Represents a collection of `Gate` accessible through a named `key`.
 *
 * @experimental
 */
export class GateCollection<GItems extends GateCollectionItems<GItems>> {
  readonly #items: GItems;

  constructor(items: GItems) {
    this.#items = items;
  }

  /* ITEMS */

  get items(): GItems {
    return this.#items;
  }

  /* GATE LIKE */

  /**
   * Opens concurrently all the `Gate`.
   *
   * Awaits that **all** the `Gate` resolve (fulfilled or rejected), before this Promise is resolved.
   * In case or error(s), the given signal is aborted, opened `Gate` are closed,
   * the returned Promise rejects with these errors aggregated.
   */
  async open(
    signal?: AbortSignal,
  ): Promise<HandleCollection<GateCollectionItemsToHandleCollectionItems<GItems>>> {
    type GHandleCollectionItems = GateCollectionItemsToHandleCollectionItems<GItems>;
    type GValue = HandleCollection<GHandleCollectionItems>;

    return new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const controller: AbortController = new AbortController();
        const sharedSignal: AbortSignal =
          signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);

        let total: number = 0;
        let done: number = 0;

        const handleMap: Record<string, Handle> = {};
        const errors: AggregatedErrorEntry[] = [];

        const allResolved = (): void => {
          const filteredErrors: readonly unknown[] = removeDuplicateAbortSignalErrorFromErrors(
            sharedSignal,
            errors,
          );

          const handleCollection = new HandleCollection<GHandleCollectionItems>(
            handleMap as GHandleCollectionItems,
          );

          if (filteredErrors.length > 0) {
            const error: unknown = new AggregatedError({
              errors: filteredErrors,
            }).shorten();

            handleCollection.close().then(
              (): void => {
                reject(error);
              },
              (_error: unknown): void => {
                reject(new SuppressedError(_error, error));
              },
            );
          } else {
            resolve(handleCollection);
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

        for (const [key, gate] of Object.entries<Gate<any>>(this.#items)) {
          total++;
          gate.open(sharedSignal).then(
            (handle: Handle): void => {
              handleMap[key] = handle;
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
   * Applies a mutation on this `GateCollection` and returns another one.
   */
  mutate<GNewItems extends GateCollectionItems<GNewItems>>(
    mutateFnc: GateCollectionMutateFunction<this, GNewItems>,
  ): GateCollection<GNewItems> {
    return new GateCollection<GNewItems>(mutateFnc(this));
  }
}
