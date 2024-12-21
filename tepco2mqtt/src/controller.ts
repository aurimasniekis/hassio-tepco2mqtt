import type * as SdNotify from 'sd-notify';
import EventBus from './eventBus';
import logger from './utils/logger';
import MQTT from './mqtt';
import { Browser } from './browser';
import { Tepco } from './tepco';
import { getTepco2MQTTVersion } from './utils/utils';


type SdNotifyType = typeof SdNotify;

export class Controller {

  readonly #eventBus: EventBus;
  readonly #mqtt: MQTT;
  readonly #browser: Browser;
  readonly #tepco: Tepco;

  readonly #restartCallback: () => Promise<void>;
  readonly #exitCallback: (code: number, restart: boolean) => Promise<void>;

  #sdNotify: SdNotifyType | undefined;

  #initialized: boolean;

  constructor(restartCallback: () => Promise<void>, exitCallback: (code: number, restart: boolean) => Promise<void>) {
    this.#eventBus = new EventBus();
    this.#mqtt = new MQTT(this.#eventBus);
    this.#browser = new Browser(this.#eventBus);
    this.#tepco = new Tepco(this.#eventBus, this.#mqtt);

    this.#initialized = false;

    this.#restartCallback = restartCallback;
    this.#exitCallback = exitCallback;
  }

  async initialize(): Promise<void> {
    if (this.#initialized) {
      throw new Error('Already initialized');
    }

    await logger.init();

    this.#eventBus.onControllerStop(this, this.stop.bind(this));

    this.#eventBus.onTepcoMaximumErrorCountReached(this, () => this.exit(1));

    this.#eventBus.onBrowserClosed(this, () => this.exit(2));

    this.#initialized = true;
  }

  async start(): Promise<void> {
    if (!this.#initialized) {
      await this.initialize();
    }

    const info = await getTepco2MQTTVersion();
    logger.info(`Starting Tepco2MQTT version ${info.version} (commit #${info.commitHash})`);

    try {
      this.#sdNotify = process.env.NOTIFY_SOCKET ? await import('sd-notify') : undefined;
      logger.debug('sd-notify loaded');
    } catch {
      // istanbul ignore next
      logger.debug('sd-notify is not installed');
    }

    // MQTT
    try {
      await this.#mqtt.connect();
    } catch (error) {
      logger.error(`MQTT failed to connect, exiting... (${(error as Error).message})`);

      return await this.exit(1);
    }

    // Tepco
    try {
      await this.#tepco.start();
    } catch (error) {
      logger.error(`Tepco failed to initialize, exiting... (${(error as Error).message})`);

      return await this.exit(1);
    }

    // Browser
    try {
      await this.#browser.start();
    } catch (error) {
      logger.error(`Browser failed to initialize, exiting... (${(error as Error).message})`);

      return await this.exit(1);
    }


    logger.info(`Tepco2MQTT started!`);

    const watchdogInterval = this.#sdNotify?.watchdogInterval() || 0;
    if (watchdogInterval > 0) {
      this.#sdNotify?.startWatchdogMode(Math.floor(watchdogInterval / 2));
    }
    this.#sdNotify?.ready();
  }

  async stop(code = 0, restart = false): Promise<void> {
    this.#sdNotify?.stopping(process.pid);

    this.#eventBus.removeListeners(this);

    // Wrap-up
    await this.#mqtt.disconnect();
    await this.#browser.stop();
    await this.#tepco.stop();

    this.#sdNotify?.stopWatchdogMode();

    return await this.exit(code, restart);
  }

  async exit(code: number, restart = false): Promise<void> {
    await logger.end();

    return await this.#exitCallback(code, restart);
  }
}
