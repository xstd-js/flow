import { AsyncFlow, type AsyncFlowNextCallback } from '../../flow/flow/async-flow.js';

export type AsyncReaderNextCallback<GValue> = AsyncFlowNextCallback<[], GValue>;

/**
 * Specialization of an `AsyncFlow` accepting no arguments and returning a `value`.
 */
export class AsyncReader<GValue> extends AsyncFlow<[], GValue> {}
