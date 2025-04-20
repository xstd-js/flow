import { AggregatedError } from '@xstd/custom-error';
import { type GenericAsyncFlow } from '../../flow/flow/generic-async-flow.js';

/* TYPES */

export type MultiAsyncFlowItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: GenericAsyncFlow;
};

/* CLASS */

/**
 * Represents a collection of `AsyncFlow`s accessible through a named `key`.
 *
 * @experimental
 */
export class MultiAsyncFlow<GItems extends MultiAsyncFlowItems<GItems>> {
  readonly #items: GItems;

  constructor(items: GItems) {
    this.#items = Object.freeze(items);
  }

  get items(): GItems {
    return this.#items;
  }

  /**
   * Closes concurrently all the `AsyncFlow`s.
   *
   * Awaits that **all** the `AsyncFlow`s resolve (fulfilled or rejected), before this Promise is resolved.
   * In case or error(s), they're aggregated and the returned Promise rejects.
   */
  close(reason?: unknown): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (reason?: any) => void): void => {
      let total: number = 0;
      let done: number = 0;

      const errors: unknown[] = [];

      const allResolved = (): void => {
        if (errors.length > 0) {
          reject(AggregatedError.of(errors));
        } else {
          resolve();
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

      for (const asyncFlow of Object.values(this.#items)) {
        total++;
        (asyncFlow as GenericAsyncFlow).close(reason).then(resolveOne, (error: unknown): void => {
          errors.push(error);
          resolveOne();
        });
      }

      checkAllResolved();
    });
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
