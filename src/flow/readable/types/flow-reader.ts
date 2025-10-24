import { type AsyncEnumeratorObject } from '@xstd/enumerable';

/**
 * An alias for an `AsyncEnumeratorObject` that reads values from a flow.
 */
export type FlowReader<GValue> = AsyncEnumeratorObject<void, GValue, void>;
