import { AggregatedError, type AggregatedErrorEntry } from '@xstd/custom-error';
import { ActiveResource } from '../active-resource.js';

/* TYPES */

export type ActiveResourceCollectionItems<GItems extends object> = {
  readonly [GKey in keyof GItems]: ActiveResource;
};

/* CLASS */

/**
 * Represents a collection of `ActiveResource` accessible through a named `key`.
 *
 * @experimental
 */
export class ActiveResourceCollection<GItems extends ActiveResourceCollectionItems<GItems>>
  implements AsyncDisposable
{
  readonly #items: GItems;

  constructor(items: GItems) {
    this.#items = Object.freeze(items);
  }

  get items(): GItems {
    return this.#items;
  }

  /**
   * Closes concurrently all the `ActiveResource`.
   *
   * Awaits that **all** the `ActiveResource` resolve (fulfilled or rejected), before this Promise is resolved.
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

      for (const [key, flow] of Object.entries<ActiveResource>(this.#items)) {
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
