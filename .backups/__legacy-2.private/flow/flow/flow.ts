import { CloseHandle, Handle, HandleTask } from '../../handle/handle.js';
import { FlowError } from '../../shared/flow-error.js';

export class Flow extends Handle {
  constructor(close: CloseHandle) {
    super(close);
  }

  override async run<GReturn>(task: HandleTask<GReturn>, signal?: AbortSignal): Promise<GReturn> {
    try {
      return await super.run(task, signal);
    } catch (error: unknown) {
      error = FlowError.of(error);
      if ((error as FlowError).type !== 'recoverable') {
        this.close(error);
      }
      throw error;
    }
  }
}
