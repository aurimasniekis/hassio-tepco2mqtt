import events from 'events';
import logger from './utils/logger';
import data from './utils/data';
import { type Browser, type HTTPRequest, HTTPResponse, type Page } from 'puppeteer';

type ListenerKey = object;

export type MQTTMessage = {topic: string; message: string};
export type MQTTMessagePublished = {topic: string; payload: string; options: {retain: boolean; qos: number}};

interface EventBusMap {
  controllerStop: [code: number, restart: boolean];
  publishAvailability: [];
  mqttMessage: [data: MQTTMessage];
  mqttMessagePublished: [data: MQTTMessagePublished];
  tepcoNewToken: [data: string];
  tepcoTokenReset: [];
  tepcoMaximumErrorCountReached: [];
  browserInitialized: [browser: Browser];
  browserClosed: [browser: Browser];
  browserPageCreated: [page: Page, browser: Browser];
  browserPageClosed: [page: Page, browser: Browser];
  browserPageRequest: [request: HTTPRequest, page: Page, browser: Browser];
  browserPageResponse: [response: HTTPResponse, page: Page, browser: Browser];
}

type EventBusListener<K> = K extends keyof EventBusMap
  ? EventBusMap[K] extends unknown[]
    ? (...args: EventBusMap[K]) => Promise<void> | void
    : () => Promise<void> | void
  : never;


export default class EventBus {
  private callbacksByExtension: {
    [s: string]: { event: keyof EventBusMap; callback: EventBusListener<keyof EventBusMap> }[]
  } = {};

  private emitter = new events.EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  public emitControllerStop(code: number, restart: boolean): void {
    this.emitter.emit('controllerStop', code, restart);
  }

  public onControllerStop(key: ListenerKey, callback: (code: number, restart: boolean) => void): void {
    this.on('controllerStop', callback, key);
  }

  public emitPublishAvailability(): void {
    this.emitter.emit('publishAvailability');
  }

  public onPublishAvailability(key: ListenerKey, callback: () => void): void {
    this.on('publishAvailability', callback, key);
  }

  public emitMQTTMessage(data: MQTTMessage): void {
    this.emitter.emit('mqttMessage', data);
  }

  public onMQTTMessage(key: ListenerKey, callback: (data: MQTTMessage) => void): void {
    this.on('mqttMessage', callback, key);
  }

  public emitMQTTMessagePublished(data: MQTTMessagePublished): void {
    this.emitter.emit('mqttMessagePublished', data);
  }

  public onMQTTMessagePublished(key: ListenerKey, callback: (data: MQTTMessagePublished) => void): void {
    this.on('mqttMessagePublished', callback, key);
  }


  public emitTepcoNewToken(data: string): void {
    this.emitter.emit('tepcoNewToken', data);
  }

  public onTepcoNewToken(key: ListenerKey, callback: (data: string) => void): void {
    this.on('tepcoNewToken', callback, key);
  }

  public emitTepcoTokenReset(): void {
    this.emitter.emit('tepcoTokenReset');
  }

  public onTepcoTokenReset(key: ListenerKey, callback: () => void): void {
    this.on('tepcoTokenReset', callback, key);
  }

  public emitTepcoMaximumErrorCountReached(): void {
    this.emitter.emit('tepcoMaximumErrorCountReached');
  }

  public onTepcoMaximumErrorCountReached(key: ListenerKey, callback: () => void): void {
    this.on('tepcoMaximumErrorCountReached', callback, key);
  }

  public emitBrowserInitialized(browser: Browser): void {
    this.emitter.emit('browserInitialized', browser);
  }

  public onBrowserInitialized(key: ListenerKey, callback: (browser: Browser) => void): void {
    this.on('browserInitialized', callback, key);
  }

  public emitBrowserClosed(browser: Browser): void {
    this.emitter.emit('browserClosed', browser);
  }

  public onBrowserClosed(key: ListenerKey, callback: (browser: Browser) => void): void {
    this.on('browserClosed', callback, key);
  }

  public emitBrowserPageCreated(page: Page, browser: Browser): void {
    this.emitter.emit('browserPageCreated', page, browser);
  }

  public onBrowserPageCreated(key: ListenerKey, callback: (page: Page, browser: Browser) => void): void {
    this.on('browserPageCreated', callback, key);
  }

  public emitBrowserPageClosed(page: Page, browser: Browser): void {
    this.emitter.emit('browserPageClosed', page, browser);
  }

  public onBrowserPageClosed(key: ListenerKey, callback: (page: Page, browser: Browser) => void): void {
    this.on('browserPageClosed', callback, key);
  }

  public emitBrowserPageRequest(request: HTTPRequest, page: Page, browser: Browser): void {
    this.emitter.emit('browserPageRequest', request, page, browser);
  }

  public onBrowserPageRequest(key: ListenerKey, callback: (request: HTTPRequest, page: Page, browser: Browser) => void): void {
    this.on('browserPageRequest', callback, key);
  }

  public emitBrowserPageResponse(response: HTTPResponse, page: Page, browser: Browser): void {
    this.emitter.emit('browserPageResponse', response, page, browser);
  }

  public onBrowserPageResponse(key: ListenerKey, callback: (response: HTTPResponse, page: Page, browser: Browser) => void): void {
    this.on('browserPageResponse', callback, key);
  }

  private on<K extends keyof EventBusMap>(event: K, callback: EventBusListener<K>, key: ListenerKey): void {
    if (!this.callbacksByExtension[key.constructor.name]) {
      this.callbacksByExtension[key.constructor.name] = [];
    }

    const wrappedCallback = async (...args: never[]): Promise<void> => {
      try {
        await callback(...args);

      } catch (error) {
        logger.error(`EventBus error '${key.constructor.name}/${event}': ${(error as Error).message}`);
        logger.debug((error as Error).stack!);
      }
    };

    this.callbacksByExtension[key.constructor.name].push({ event, callback: wrappedCallback });
    this.emitter.on(event, wrappedCallback as EventBusListener<K>);
  }

  public removeListeners(key: ListenerKey): void {
    this.callbacksByExtension[key.constructor.name]?.forEach((e) => this.emitter.removeListener(e.event, e.callback));
  }
}
