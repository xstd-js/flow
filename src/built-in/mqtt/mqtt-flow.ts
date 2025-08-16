import { abortify } from '@xstd/abortable';
import mqtt, {
  type IDisconnectPacket,
  type IPublishPacket,
  type ISubscriptionGrant,
  type MqttClient,
  type MqttClientEventCallbacks,
} from 'mqtt';
import { Drain } from '../../drain/drain.js';

import { getAsyncEnumeratorNextValue } from '../../enumerable/enumerable.js';
import { flowSyncBridge } from '../../flow/bridge/flow-sync-bridge.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { type ReadableFlowForkOptions } from '../../flow/readable/types/methods/fork/readable-flow-fork-options.js';
import { type ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';
import { type ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { type HavingQueuingStrategy } from '../../shared/queue-controller/classic/having-queuing-strategy.js';
import { CountSharedQueue } from '../../shared/queue-controller/shared/built-in/count-shared-queue.js';
import { listenTypedEventEmitter } from './functions.private/listen-typed-event-emitter.js';
import { MqttTopic } from './topic/mqtt-topic.js';

export interface MqttOptions extends Omit<ReadableFlowForkOptions, 'queuingStrategy'> {
  readonly clientId?: string;
  readonly username?: string;
  readonly password?: string;
}

export interface MqttUpPacket {
  readonly topic: string;
  readonly payload: string | Uint8Array;
  readonly qos?: 0 | 1 | 2;
  readonly retain?: boolean;
  readonly dup?: boolean;
}

export interface MqttDownPacket {
  readonly topic: string;
  readonly payload: Uint8Array;
}

export interface MqttSubscriptionOptions {
  readonly qos?: 0 | 1 | 2;
  readonly noLocal?: boolean;
  readonly retainAsPublished?: boolean;
  readonly retainHandling?: 0 | 1 | 2;
}

export class MqttFlow {
  readonly #forkOptions: Omit<ReadableFlowForkOptions, 'queuingStrategy'>;

  readonly #sharedMqttClientFlow: ReadableFlow<MqttClient>;

  readonly #up: Drain<MqttUpPacket>;
  readonly #subscriptions: Map<string /* key */, ReadableFlow<MqttClient>>;
  readonly #activeSubscriptions: Set<string /* topic */>;

  constructor(url: string | URL, { disposeHook, ...mqttOptions }: MqttOptions = {}) {
    this.#forkOptions = {
      disposeHook,
    };

    this.#sharedMqttClientFlow = new ReadableFlow<MqttClient>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<MqttClient> {
      signal.throwIfAborted();

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      const client: MqttClient = stack.adopt(
        await mqtt.connectAsync(url.toString(), {
          ...mqttOptions,
          reconnectPeriod: 0,
          autoUseTopicAlias: true,
          autoAssignTopicAlias: true,
        }),
        (client: MqttClient): Promise<void> => {
          return client.endAsync();
        },
      );

      signal.throwIfAborted();

      // TODO
      client.setMaxListeners(20);
      // client.setMaxListeners(50);

      yield client;
    }).fork({
      ...this.#forkOptions,
      queuingStrategy: CountSharedQueue.one,
    });

    this.#up = new Drain<MqttUpPacket>(
      async (flow: ReadableFlow<MqttUpPacket>, signal: AbortSignal): Promise<void> => {
        signal.throwIfAborted();

        await using stack: AsyncDisposableStack = new AsyncDisposableStack();

        const client: MqttClient = await getAsyncEnumeratorNextValue(
          stack.use(this.#sharedMqttClientFlow.open(signal)),
        );

        for await (const { topic, payload, ...options } of flow.open(signal)) {
          await abortify(client.publishAsync(topic, payload as any, options), {
            signal,
          });
        }
      },
    );

    this.#subscriptions = new Map<string, ReadableFlow<MqttClient>>();
    this.#activeSubscriptions = new Set<string>();
  }

  get up(): Drain<MqttUpPacket> {
    return this.#up;
  }

  subscription(
    topic: string,
    {
      qos = 0,
      noLocal = false,
      retainAsPublished = false,
      retainHandling = 0,
    }: MqttSubscriptionOptions = {},
  ): ReadableFlow<MqttDownPacket, [options?: HavingQueuingStrategy]> {
    const key: string = JSON.stringify([topic, qos, noLocal, retainAsPublished, retainHandling]);

    let subscription: ReadableFlow<MqttClient> | undefined = this.#subscriptions.get(key);

    if (subscription === undefined) {
      const self: this = this;

      subscription = new ReadableFlow<MqttClient>(async function* ({
        signal,
      }: ReadableFlowContext): ReadableFlowIterator<MqttClient> {
        signal.throwIfAborted();

        // LOCK SUBSCRIPTION

        if (self.#activeSubscriptions.has(topic)) {
          throw new Error(`Subscription to "${topic}" already locked.`);
        }

        await using stack: AsyncDisposableStack = new AsyncDisposableStack();

        self.#activeSubscriptions.add(topic);

        stack.defer((): void => {
          self.#activeSubscriptions.delete(topic);
        });

        // GET CLIENT

        const client: MqttClient = await getAsyncEnumeratorNextValue(
          stack.use(self.#sharedMqttClientFlow.open(signal)),
        );

        // SUBSCRIBE
        {
          const [granted]: readonly ISubscriptionGrant[] = stack.adopt(
            await client.subscribeAsync(topic, {
              qos,
              nl: noLocal,
              rap: retainAsPublished,
              rh: retainHandling,
            }),
            (): Promise<any> => {
              return client.unsubscribeAsync(topic);
            },
          );

          signal.throwIfAborted();

          if (qos !== undefined && granted.qos < qos) {
            throw new Error(
              `Cannot subscribe to "${topic}" with a qos of ${qos}. Granted ${granted.qos}.`,
            );
          }
        }

        yield client;
      }).fork({
        ...this.#forkOptions,
        queuingStrategy: CountSharedQueue.one,
      });

      this.#subscriptions.set(key, subscription);
    }

    return new ReadableFlow<MqttDownPacket, [options?: HavingQueuingStrategy]>(async function* (
      { signal }: ReadableFlowContext,
      options?: HavingQueuingStrategy,
    ): ReadableFlowIterator<MqttDownPacket> {
      signal.throwIfAborted();

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      // GET CLIENT AND SUBSCRIBE

      const client: MqttClient = await getAsyncEnumeratorNextValue(
        stack.use(subscription.open(signal)),
      );

      if (!client.connected) {
        throw new Error('MqttClient closed.');
      }

      // BRIDGE

      const [bridge, reader] = flowSyncBridge<MqttDownPacket>(signal, options);

      // ON ERROR
      stack.use(
        listenTypedEventEmitter<MqttClientEventCallbacks, 'error'>(
          client,
          'error',
          (error: unknown): void => {
            bridge.error(error);
          },
        ),
      );

      // ON DISCONNECT
      stack.use(
        listenTypedEventEmitter<MqttClientEventCallbacks, 'disconnect'>(
          client,
          'disconnect',
          (packet: IDisconnectPacket): void => {
            if (packet.reasonCode === undefined || packet.reasonCode === 0x00) {
              bridge.complete();
            } else {
              bridge.error(new Error('Disconnected', { cause: packet }));
            }
          },
        ),
      );

      // ON END
      stack.use(
        listenTypedEventEmitter<MqttClientEventCallbacks, 'end'>(client, 'end', (): void => {
          bridge.error(new Error('Client ended'));
        }),
      );

      // ON MESSAGE
      const topicMatcher: MqttTopic = new MqttTopic(topic);

      stack.use(
        listenTypedEventEmitter<MqttClientEventCallbacks, 'message'>(
          client,
          'message',
          (topic: string, payload: Buffer, _packet: IPublishPacket): void => {
            if (topicMatcher.matches(topic)) {
              bridge.next({
                topic,
                payload,
              });
            }
          },
        ),
      );

      // DELEGATE TO THE BRIDGE

      yield* reader;
    });
  }
}
