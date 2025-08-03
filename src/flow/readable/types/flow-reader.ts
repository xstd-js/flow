import { type AsyncEnumeratorObject } from '../../../enumerable/enumerable.js';

export type FlowReader<GValue> = AsyncEnumeratorObject<void, GValue, void>;
