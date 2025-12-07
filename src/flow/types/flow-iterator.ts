/**
 * An alias for the `AsyncGenerator` returned by a readable flow factory.
 */
export type FlowIterator<GValue> = AsyncGenerator<GValue, void, void>;
