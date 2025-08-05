import { abortify } from '@xstd/abortable';
import mqtt, {
  type IDisconnectPacket,
  type IPublishPacket,
  type ISubscriptionGrant,
  type MqttClient,
} from 'mqtt';
import { Drain } from '../../drain/drain.js';
import { flowSyncBridge } from '../../flow/bridge/flow-sync-bridge.js';
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { type ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';

import { getAsyncEnumeratorNextValue } from '../../enumerable/enumerable.js';
import { type FlowReader } from '../../flow/readable/types/flow-reader.js';
import { type ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { type PushToPullOptions } from '../../shared/push-to-pull-options.js';
import { MqttTopic } from './topic/mqtt-topic.js';

export interface MqttOptions {
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
  readonly #sharedMqttClientFlow: ReadableFlow<MqttClient>;

  readonly #up: Drain<MqttUpPacket>;
  readonly #subscriptions: Map<string /* key */, ReadableFlow<MqttClient>>;
  readonly #activeSubscriptions: Set<string /* topic */>;

  constructor(url: string | URL, options: MqttOptions = {}) {
    this.#sharedMqttClientFlow = new ReadableFlow<MqttClient>(async function* ({
      signal,
    }: ReadableFlowContext): ReadableFlowIterator<MqttClient> {
      signal.throwIfAborted();

      await using stack: AsyncDisposableStack = new AsyncDisposableStack();

      const client: MqttClient = stack.adopt(
        await mqtt.connectAsync(url.toString(), {
          ...options,
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
    }).edge();

    this.#up = new Drain<MqttUpPacket>(
      async (flow: ReadableFlow<MqttUpPacket>, signal: AbortSignal): Promise<void> => {
        signal.throwIfAborted();

        await using clientReader: FlowReader<MqttClient> = this.#sharedMqttClientFlow.open(signal);

        const client: MqttClient = await getAsyncEnumeratorNextValue(clientReader);

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
  ): ReadableFlow<MqttDownPacket, [options?: PushToPullOptions]> {
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
          const [granted]: readonly ISubscriptionGrant[] = await client.subscribeAsync(topic, {
            qos,
            nl: noLocal,
            rap: retainAsPublished,
            rh: retainHandling,
          });

          stack.defer((): Promise<any> => {
            return client.unsubscribeAsync(topic);
          });

          signal.throwIfAborted();

          if (qos !== undefined && granted.qos < qos) {
            throw new Error(
              `Cannot subscribe to "${topic}" with a qos of ${qos}. Granted ${granted.qos}.`,
            );
          }
        }

        yield client;
      }).edge();

      this.#subscriptions.set(key, subscription);
    }

    return new ReadableFlow<MqttDownPacket, [options?: PushToPullOptions]>(async function* (
      { signal }: ReadableFlowContext,
      options?: PushToPullOptions,
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
      {
        const onClientError = (error: unknown): void => {
          bridge.error(error);
        };

        client.on('error', onClientError);

        stack.defer((): void => {
          client.off('error', onClientError);
        });
      }

      // ON DISCONNECT
      {
        const onClientDisconnect = (packet: IDisconnectPacket): void => {
          if (packet.reasonCode === undefined || packet.reasonCode === 0x00) {
            bridge.complete();
          } else {
            bridge.error(new Error('Disconnected', { cause: packet }));
          }
        };

        client.on('disconnect', onClientDisconnect);

        stack.defer((): void => {
          client.off('disconnect', onClientDisconnect);
        });
      }

      // ON END
      {
        const onClientEnd = (): void => {
          bridge.error(new Error('Client ended'));
        };

        client.on('end', onClientEnd);

        stack.defer((): void => {
          client.off('end', onClientEnd);
        });
      }

      // ON MESSAGE
      {
        const topicMatcher: MqttTopic = new MqttTopic(topic);

        const onClientMessage = (topic: string, payload: Buffer, _packet: IPublishPacket): void => {
          if (topicMatcher.matches(topic)) {
            bridge.write({
              topic,
              payload,
            });
          }
        };

        client.on('message', onClientMessage);

        stack.defer((): void => {
          client.off('message', onClientMessage);
        });
      }

      // DELEGATE TO THE BRIDGE

      yield* reader;
    });
  }
}
