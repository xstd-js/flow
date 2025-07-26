import { AggregatedError, type AggregatedErrorEntry } from '@xstd/custom-error';
import { Handle } from '../handle.js';

/* TYPES */

export type HandleCollectionItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: Handle;
};

/* CLASS */

/**
 * Represents a collection of `Handle` accessible through a named `key`.
 *
 * @experimental
 */
export class HandleCollection<GItems extends HandleCollectionItems<GItems>> {
  readonly #items: GItems;

  constructor(items: GItems) {
    this.#items = Object.freeze(items);
  }

  get items(): GItems {
    return this.#items;
  }

  /**
   * Closes concurrently all the `Handle`.
   *
   * Awaits that **all** the `Handle` resolve (fulfilled or rejected), before this Promise is resolved.
   * In case or error(s), they're aggregated and the returned Promise rejects.
   */
  close(reason?: unknown): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (reason?: any) => void): void => {
      let total: number = 0;
      let done: number = 0;

      const errors: AggregatedErrorEntry[] = [];

      const allResolved = (): void => {
        if (errors.length > 0) {
          reject(new AggregatedError({ errors }).shorten());
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

      for (const [key, flow] of Object.entries<Handle>(this.#items)) {
        total++;
        flow.close(reason).then(resolveOne, (error: unknown): void => {
          errors.push([key, error]);
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
