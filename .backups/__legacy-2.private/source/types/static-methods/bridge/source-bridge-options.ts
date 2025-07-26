import { PushToPullOptions } from '../../../../flow/bridge/types/push-to-pull-options.js';
import { SourceOptions } from '../../../source.js';

export interface SourceBridgeOptions extends PushToPullOptions, SourceOptions {}
