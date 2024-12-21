import type EventBus from './eventBus';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { type Browser as PuppeteerBrowser, type Page } from 'puppeteer';
import settings from './utils/settings';
import logger from './utils/logger';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackersAndAnnoyances: true }));

const NS = 't2m:browser';

export class Browser {
  readonly #eventBus: EventBus;

  #browser: PuppeteerBrowser | undefined;
  #page: Page | undefined;

  constructor(eventBus: EventBus) {
    this.#eventBus = eventBus;
  }

  public async start(): Promise<void> {
    logger.debug('Starting Browser', NS);

    const options: Parameters<typeof puppeteer.launch>[0] = {
      headless: settings.get().browser.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        ...settings.get().browser.additionalArgs,
      ],
    };

    const userDataDir = settings.get().browser.userDataDir;
    if (userDataDir != null) {
      options.userDataDir = userDataDir;
    }

    const exePath = settings.get().browser.executablePath;
    if (exePath != null) {
      options.executablePath = exePath;
    }

    this.#browser = await puppeteer.launch(options);

    this.#eventBus.emitBrowserInitialized(this.#browser);

    this.#page =
      (await this.#browser.pages())?.[0] ?? (await this.#browser.newPage());
    await this.#page.setBypassServiceWorker(true);

    this.#eventBus.emitBrowserPageCreated(this.#page, this.#browser);

    this.#page.on('request', (request) => {
      this.#eventBus.emitBrowserPageRequest(request, this.#page, this.#browser);
    });

    this.#page.on('response', (response) => {
      this.#eventBus.emitBrowserPageResponse(
        response,
        this.#page,
        this.#browser
      );
    });

    this.#browser.on('disconnected', () => {
      this.#eventBus.emitBrowserClosed(this.#browser);
    });

    this.#page.on('close', () => {
      this.#eventBus.emitBrowserPageClosed(this.#page, this.#browser);
    });

    logger.debug('Browser Started', NS);
  }

  public async stop() {
    logger.debug('Stopping Browser', NS);

    await this.#page?.close();
    await this.#browser?.close();

    this.#eventBus.removeListeners(this);

    logger.debug('Browser Stopped', NS);
  }
}
