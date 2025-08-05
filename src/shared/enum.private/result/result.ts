import { type ResultErr } from './err/result-err.js';
import { type ResultOk } from './ok/result-ok.js';

export type Result<GValue, GError = unknown> = ResultOk<GValue> | ResultErr<GError>;
