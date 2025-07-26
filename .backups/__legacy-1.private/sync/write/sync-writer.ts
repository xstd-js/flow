import { SyncFlow, SyncFlowNextCallback } from '../flow/sync-flow.js';

export type SyncWriterNextCallback<GValue> = SyncFlowNextCallback<[GValue], void>;

export class SyncWriter<GValue> extends SyncFlow<[GValue], void> {}
