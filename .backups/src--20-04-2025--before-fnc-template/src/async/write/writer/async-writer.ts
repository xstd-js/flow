import { AsyncFlow, type AsyncFlowNextCallback } from '../../flow/flow/async-flow.js';

export type AsyncWriterNextCallback<GValue> = AsyncFlowNextCallback<[GValue], void>;

/**
 * Specialization of an `AsyncFlow` accepting a `value` and returning nothing.
 */
export class AsyncWriter<GValue> extends AsyncFlow<[GValue], void> {}
