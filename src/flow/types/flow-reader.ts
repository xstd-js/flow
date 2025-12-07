import { type AsyncEnumeratorObject } from '@xstd/enumerable';

/**
 * An alias for an `AsyncEnumeratorObject` that reads values from a Flow.
 */
export type FlowReader<GValue> = AsyncEnumeratorObject<void, GValue, void>;
