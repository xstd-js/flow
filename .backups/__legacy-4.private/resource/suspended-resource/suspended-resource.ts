import { ActiveResource } from '../active-resource/active-resource.js';

export interface OpenSuspendedResource<GActiveResource extends ActiveResource> {
  (signal?: AbortSignal): PromiseLike<GActiveResource> | GActiveResource;
}

export class SuspendedResource<GActiveResource extends ActiveResource> {
  readonly #open: OpenSuspendedResource<GActiveResource>;

  constructor(open: OpenSuspendedResource<GActiveResource>) {
    this.#open = open;
  }

  async open(signal?: AbortSignal): Promise<GActiveResource> {
    signal?.throwIfAborted();
    return this.#open(signal);
  }
}
