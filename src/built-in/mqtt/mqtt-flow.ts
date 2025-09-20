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
import { ReadableFlow } from '../../flow/readable/readable-flow.js';
import { type ReadableFlowContext } from '../../flow/readable/types/readable-flow-context.js';
import { type ReadableFlowIterator } from '../../flow/readable/types/readable-flow-iterator.js';
import { type PushBridge } from '../../flow/readable/types/static-methods/from-push-source/push-bridge.js';
import { type PushToPullOptions } from '../../shared/queue/bridge/push-to-async-pull-queue/push-to-pull-options/push-to-pull-options.js';
import { addTypedEventEmitterListener } from './functions.private/listen-typed-event-emitter.js';
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

  constructor(url: string | URL, mqttOptions?: MqttOptions) {
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

      while (client.connected) {
        yield client;
        signal.throwIfAborted();
      }

      throw new Error('MqttClient closed.');
    }).fork();

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

        while (client.connected) {
          yield client;
          signal.throwIfAborted();
        }

        throw new Error('MqttClient closed.');
      }).fork();

      this.#subscriptions.set(key, subscription);
    }

    return subscription.flatMap(
      (client: MqttClient): ReadableFlow<MqttDownPacket, [options?: PushToPullOptions]> => {
        if (!client.connected) {
          throw new Error('MqttClient closed.');
        }

        return ReadableFlow.fromPushSource<MqttDownPacket>(
          ({ next, error, complete, signal }: PushBridge<MqttDownPacket>): void => {
            // ON ERROR
            addTypedEventEmitterListener<MqttClientEventCallbacks, 'error'>(
              client,
              'error',
              (_error: unknown): void => {
                error(_error);
              },
              signal,
            );

            // ON DISCONNECT
            addTypedEventEmitterListener<MqttClientEventCallbacks, 'disconnect'>(
              client,
              'disconnect',
              (packet: IDisconnectPacket): void => {
                if (packet.reasonCode === undefined || packet.reasonCode === 0x00) {
                  complete();
                } else {
                  error(new Error('Disconnected', { cause: packet }));
                }
              },
              signal,
            );

            // ON END
            addTypedEventEmitterListener<MqttClientEventCallbacks, 'end'>(
              client,
              'end',
              (): void => {
                error(new Error('Client ended'));
              },
              signal,
            );

            // ON MESSAGE
            const topicMatcher: MqttTopic = new MqttTopic(topic);

            addTypedEventEmitterListener<MqttClientEventCallbacks, 'message'>(
              client,
              'message',
              (topic: string, payload: Buffer, _packet: IPublishPacket): void => {
                if (topicMatcher.matches(topic)) {
                  next({
                    topic,
                    payload,
                  });
                }
              },
              signal,
            );
          },
        );
      },
    );
  }
}
