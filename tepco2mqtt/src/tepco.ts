import EventBus, { type MQTTMessage } from './eventBus';
import logger from './utils/logger';
import settings from './utils/settings';
import { seconds } from './utils/utils';
import { type Page, TimeoutError } from 'puppeteer';
import { isTokenExpired } from './utils/jwt';
import type { MakeResponse, TepcoClient } from './api';
import { ContractClass, type ContractType, list } from './api/contract/list';
import { member } from './api/contract/member';
import { gas } from './api/billing/gas';
import moment from 'moment';
import { month } from './api/billing/month';
import type MQTT from './mqtt';
import data from './utils/data';

const NS = 't2m:tepco';

const supportedContractClasses: ContractClass[] = [
  ContractClass.NEW_ELECTRIC,
  ContractClass.GAS,
];

interface TrackedContract {
  id: string;
  accountId: string;
  contractClass: ContractClass;
  contractType: ContractType;
  contractNo: string;
  planName: string;
  address: string;
  device_class: string;
  unit: string;
}

interface Usage {
  charge: string;
  used: string;
  unit: string;
  last_reset: string;
}

export class Tepco {
  #eventBus: EventBus;
  #mqtt: MQTT;

  #apiToken: string | undefined;

  readonly #initialRun: boolean;

  readonly #haStatusTopic: string;
  readonly #haDiscoveryTopic: string;

  #refreshPageTimer: NodeJS.Timer | undefined;
  #refreshDataTimer: NodeJS.Timer | undefined;

  #errorCount = 0;

  readonly #api: TepcoClient;

  #trackedContracts: TrackedContract[] | undefined;
  #cachedUsages: Map<string, Usage> | undefined;

  constructor(eventBus: EventBus, mqtt: MQTT) {
    this.#eventBus = eventBus;
    this.#mqtt = mqtt;

    this.#initialRun = settings.get().tepco.initialRun;

    this.#haStatusTopic = settings.get().homeassistant.status_topic;
    this.#haDiscoveryTopic = settings.get().homeassistant.discovery_topic;

    const self = this;
    this.#api = {
      requestGet<T>(url: string): Promise<MakeResponse<T>> {
        return self.apiRequestGet(url);
      },
    };

    if (
      settings.get().homeassistant.discovery_topic ===
      settings.get().mqtt.base_topic
    ) {
      throw new Error(
        `'homeassistant.discovery_topic' cannot not be equal to the 'mqtt.base_topic' (got '${
          settings.get().mqtt.base_topic
        }')`
      );
    }
  }

  public async start() {
    logger.debug('Starting Tepco Client', NS);

    this.#eventBus.onMQTTMessage(this, this.onMQTTMessage.bind(this));

    this.#eventBus.onBrowserPageRequest(this, (request) => {
      if (
        request.method() === 'GET' &&
        request.url().startsWith('https://kcx-api.tepco-z.com/kcx/')
      ) {
        const authorized = request.headers()['authorization'];

        if (authorized == null) {
          logger.warn(
            `Received no Authorized header value on url: ${request.url()}`,
            NS
          );
        }

        this.setTokenFromHeader(authorized);
      }

      const type = request.resourceType().toLowerCase();
      if (
        type === 'image' ||
        type === 'stylesheet' ||
        type === 'font' ||
        type === 'media'
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    this.#eventBus.onBrowserPageCreated(this, async (page) => {
      logger.debug('Browser page created starting Tepco page tracking', NS);

      await page.setRequestInterception(true);
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1, isLandscape: true });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

      if (this.#refreshPageTimer != null) {
        clearInterval(this.#refreshPageTimer);
      }

      this.#refreshPageTimer = setInterval(async () => {
        await this.pageRefreshTask(page);
      }, seconds(settings.get().tepco.interval));

      await this.pageRefreshTask(page);
    });

    this.#eventBus.onBrowserPageClosed(this, () => {
      logger.debug('Browser page closed stopping', NS);

      if (this.#refreshPageTimer != null) {
        clearInterval(this.#refreshPageTimer);
      }
    });

    this.#mqtt.subscribe(this.#haStatusTopic);

    logger.debug('Tepco Client Started', NS);
  }

  public async stop() {
    logger.debug('Stopping Tepco Client', NS);

    if (this.#refreshPageTimer != null) {
      clearInterval(this.#refreshPageTimer);
    }

    this.#eventBus.removeListeners(this);

    logger.debug('Stopped Tepco Client', NS);
  }

  protected async pageRefreshTask(page: Page) {
    logger.debug('Page refresh task', NS);

    try {
      await page.goto('https://www.app.kurashi.tepco.co.jp/', {
        waitUntil: 'networkidle0',
        timeout: seconds(settings.get().browser.timeout),
      });
    } catch (e: unknown) {
      if (e instanceof TimeoutError) {
        logger.warn('Failed to load page due to timeout. Skipping task', NS);

        return;
      }

      logger.error('Failed to load page: ' + e, NS);

      await this.increaseError();

      return;
    }

    if (await this.checkPageLoginStatus(page)) {
      logger.debug('Page refresh task done', NS);

      await this.check();

      return;
    }
  }

  protected async checkPageLoginStatus(page: Page) {
    logger.debug('Checking login status', NS);

    let url = page.url();
    if (url.startsWith('https://epauth.tepco.co.jp/u/login?state')) {
      logger.info('Detected login page. Trying to login...', NS);

      await page.waitForSelector('#username');

      await page.locator('#username').fill(settings.get().tepco.email);
      await page.locator('#password').fill(settings.get().tepco.password);

      try {
        logger.debug('Waiting for login to complete', NS);

        await Promise.all([
          await page.locator('button[name="action"]').click(),
          await page.waitForNavigation({
            timeout: seconds(settings.get().browser.timeout),
          }),
        ]);

        url = page.url();
        if (url.startsWith('https://www.app.kurashi.tepco.co.jp/')) {
          logger.info('Login success', NS);

          return true;
        } else {
          logger.error('Login failed ended in unexpected page: ' + url, NS);

          await this.increaseError();

          return false;
        }
      } catch (e: unknown) {
        if (e instanceof TimeoutError) {
          logger.error('Login failed due to timeout', NS);

          return false;
        }

        logger.error('Login failed due to unknown error: ' + e, NS);

        await this.increaseError();

        return false;
      }
    }

    return true;
  }

  protected async onMQTTMessage(data: MQTTMessage) {
    const topicName = data.topic;

    if (
      topicName === this.#haStatusTopic &&
      data.message.toLowerCase() === 'online'
    ) {
      logger.debug(
        'HA status message received. Publishing all devices in 30s',
        NS
      );

      const timer = setTimeout(async () => {
        // Publish all contracts as devices to HA
        if (
          this.#trackedContracts != null &&
          this.#trackedContracts.length > 0
        ) {
          for (const c of this.#trackedContracts) {
            await this.haPublishContractDiscover(c);
            await this.haPublishCachedState(c);
          }
        }

        clearTimeout(timer);
      }, seconds(30));
    }
  }

  protected async setContractUsage(contract: TrackedContract, usage: Usage) {
    if (this.#cachedUsages == null) {
      this.#cachedUsages = new Map<string, Usage>();
    }

    const prevUsage = this.#cachedUsages.get(contract.id);
    if (
      prevUsage != null &&
      prevUsage.used === usage.used &&
      prevUsage.charge === usage.charge
    ) {
      return;
    }

    this.#cachedUsages.set(contract.id, usage);

    await this.haPublishContractState(contract, usage);
  }

  protected async haPublishCachedState(contract: TrackedContract) {
    if (this.#cachedUsages == null || !this.#cachedUsages.has(contract.id)) {
      return;
    }

    await this.haPublishContractState(
      contract,
      this.#cachedUsages.get(contract.id)!
    );
  }

  protected async haPublishContractState(
    contract: TrackedContract,
    usage: Usage
  ) {
    const publishTopic = `${settings.get().mqtt.base_topic}/${
      contract.id
    }/state`;

    const msg = {
      usage: usage.used,
      cost: usage.charge,
      last_reset: usage.last_reset,
    };

    await this.#mqtt.publish(
      publishTopic,
      JSON.stringify(msg),
      {},
      '',
      false,
      false
    );
  }

  protected async haPublishContractDiscover(contract: TrackedContract) {
    const version = '';
    const publishTopic = `${settings.get().mqtt.base_topic}/${
      contract.id
    }/state`;

    const msg = {
      avty: [
        {
          t: `${settings.get().mqtt.base_topic}/state`,
          val_tpl: '{{ value_json.state }}',
        },
      ],
      avty_mode: 'all',
      dev: {
        cu: 'https://www.app.kurashi.tepco.co.jp/',
        ids: [contract.id],
        name: `${contract.planName} #${contract.contractNo}`,
        mf: 'Tepco',
        mdl: `${contract.address} (${contract.planName} #${contract.contractNo})`,
        sw: `Contract No: ${contract.contractNo}`,
        sn: contract.id,
        hw: `Account Id: ${contract.accountId}`,
      },
      o: {
        name: 'Tepco2MQTT',
        sw: version,
        url: 'https://github.com/aurimasniekis/hassio-tepco2mqtt',
      },
      cmps: {
        [`${contract.id}_usage`]: {
          p: 'sensor',
          dev_cla: contract.device_class,
          unit_of_meas: contract.unit,
          uniq_id: `${contract.id}_usage`,
          val_tpl: '{{ value_json.usage }}',
          en: true,
          stat_cla: 'total_increasing',
          name: 'Usage',
        },
        [`${contract.id}_cost`]: {
          p: 'sensor',
          dev_cla: 'monetary',
          unit_of_meas: '¥',
          uniq_id: `${contract.id}_cost`,
          val_tpl: '{{ value_json.cost }}',
          en: true,
          stat_cla: 'total',
          lrst_t: publishTopic,
          lrst_val_tpl: '{{ strptime(value_json.last_reset, \'%Y%m%d\') }}',
          name: 'Cost',
        },
      },
      stat_t: publishTopic,
      qos: 2,
    };

    await this.#mqtt.publish(
      `${this.#haDiscoveryTopic}/device/${contract.id}/config`,
      JSON.stringify(msg),
      { retain: true, qos: 1 },
      '',
      false,
      false
    );
  }

  protected async runTask() {
    if (this.#trackedContracts == null) {
      logger.error('Missing tracked contracts', NS);

      this.#eventBus.emitControllerStop(1, false);

      return;
    }

    const currentDate = moment();
    for (const contract of this.#trackedContracts) {
      logger.debug(
        `Updating contract (${contract.contractType}): ${contract.id}`,
        NS
      );

      let usage: Usage;
      switch (contract.contractClass) {
        case ContractClass.NEW_ELECTRIC:
          usage = await this.fetchElectricityUsage(
            currentDate,
            contract.contractNo,
            contract.contractClass,
            contract.accountId
          );
          break;

        case ContractClass.GAS:
          usage = await this.fetchGasUsage(
            currentDate,
            contract.contractNo,
            contract.accountId
          );

          break;

        default:
          logger.error(
            `Unsupported contract type: ${contract.contractType}`,
            NS
          );

          this.#eventBus.emitControllerStop(1, false);

          return;
      }

      logger.debug(
        `Contract<${contract.contractType}>(${contract.id}) usage: ${usage.used}${usage.unit} (${usage.charge}¥)`,
        NS
      );

      await this.setContractUsage(contract, usage);
    }
  }

  protected async startTask() {
    if (this.#refreshDataTimer != null) {
      clearInterval(this.#refreshDataTimer);
    }

    await this.runTask();

    this.#refreshDataTimer = setInterval(async () => {
      await this.runTask();
    }, seconds(settings.get().tepco.interval));
  }

  protected stopTask() {
    if (this.#refreshDataTimer != null) {
      clearInterval(this.#refreshDataTimer);
    }
  }

  protected async check() {
    if (
      this.#apiToken == null ||
      this.#apiToken.length === 0 ||
      isTokenExpired(this.#apiToken)
    ) {
      logger.debug('No valid Tepco API token found', NS);

      this.clearToken();
      this.stopTask();

      return;
    }

    if (this.#initialRun) {
      await this.initialRun();

      return;
    } else if (this.#trackedContracts == null) {
      await this.secondRun();
    }

    if (this.#refreshDataTimer == null) {
      await this.startTask();
    }
  }

  protected async secondRun() {
    logger.debug('Second run detected', NS);
    const contracts = await this.fetchListOfContracts();
    const toTrackedContractIds = settings.get().tepco.contractIds;

    const trackedContracts: TrackedContract[] = [];
    if (toTrackedContractIds == null || toTrackedContractIds.length === 0) {
      contracts.forEach((c) =>
        trackedContracts.push({
          id: c.id,
          accountId: c.accountId,
          contractClass: c.contractClass,
          contractType: c.type,
          contractNo: c.contractNo,
          planName: c.planName,
          address: c.address,
          device_class:
            c.contractClass === ContractClass.NEW_ELECTRIC ? 'energy' : 'gas',
          unit: c.contractClass === ContractClass.NEW_ELECTRIC ? 'kWh' : 'm³',
        })
      );
    } else {
      let foundAll = true;
      for (const contractId of toTrackedContractIds) {
        let found = false;
        for (const c of contracts) {
          if (c.id === contractId) {
            trackedContracts.push({
              id: c.id,
              accountId: c.accountId,
              contractClass: c.contractClass,
              contractType: c.type,
              contractNo: c.contractNo,
              planName: c.planName,
              address: c.address,
              device_class:
                c.contractClass === ContractClass.NEW_ELECTRIC
                  ? 'energy'
                  : 'gas',
              unit:
                c.contractClass === ContractClass.NEW_ELECTRIC ? 'kWh' : 'm³',
            });

            found = true;
            break;
          }
        }

        if (!found) {
          logger.error(`Contract with id "${contractId}" not found`, NS);

          foundAll = false;
        }
      }

      if (!foundAll) {
        this.#eventBus.emitControllerStop(1, false);

        return;
      }
    }

    await this.setTrackedContracts(trackedContracts);

    logger.info(
      `Starting to track Contracts (${trackedContracts
        .map((c) => c.id)
        .join(', ')})`,
      NS
    );
  }

  protected async initialRun() {
    logger.debug('Initial run detected', NS);
    const memberInfo = await this.fetchMemberInfo();
    const contracts = await this.fetchListOfContracts();

    logger.info(
      `Found Tepco account: ${memberInfo.accountKey} ${memberInfo.name} (${memberInfo.nameKana}) with email (${memberInfo.email})`
    );
    logger.info(`Found ${contracts.length} contracts`);
    contracts.forEach((c) =>
      logger.info(
        `Found ${c.type} contract with id (${c.id}):` +
          ` Plan name: ${c.planName} Rate category: ${c.rateCategory},` +
          ` Contract No: ${c.contractNo}, Address: ${c.address}`
      )
    );

    logger.info(
      'If you wish to track only specific Contracts. Please specify them in "configuration.yaml" file under "tepco.contractIds" option'
    );
    logger.info(
      'Please configure "tepco.initialRun" to false to start tracking. The Tepco2MQTT will exit now'
    );

    this.#eventBus.emitControllerStop(0, false);
  }

  protected async fetchElectricityUsage(
    usedMonth: moment.Moment,
    contractNum: string,
    contractClass: ContractClass,
    accountId: string
  ): Promise<Usage> {
    const resp = await month(
      this.#api,
      contractNum,
      moment(usedMonth).add(1, 'month').format('YYYYMM'),
      contractClass,
      accountId
    );

    return {
      charge: resp.billInfo.usedInfo.charge,
      used: resp.billInfo.usedInfo.power,
      unit: 'kWh',
      last_reset: usedMonth.format('YYYYMM01'),
    };
  }

  protected async fetchGasUsage(
    month: moment.Moment,
    contractNum: string,
    accountId: string
  ): Promise<Usage> {
    const resp = await gas(
      this.#api,
      contractNum,
      moment(month).add(1, 'month').format('YYYYMM'),
      accountId
    );

    return {
      charge: resp.billInfo.usedInfo.charge,
      used: resp.billInfo.usedInfo.power,
      unit: 'm³',
      last_reset: month.format('YYYYMM01'),
    };
  }

  protected async fetchMemberInfo() {
    const response = await member(this.#api);

    return {
      accountKey: response.memberInfo.accountKey,
      name: response.memberInfo.nameInfo.name1,
      nameKana: response.memberInfo.nameInfo.nameKana1,
      email: response.memberInfo.mailAddress,
    };
  }

  protected async fetchListOfContracts() {
    const listOfContracts = await list(this.#api);

    return listOfContracts.contracts
      .sort((a, b) => parseInt(a.contractClass) + parseInt(b.contractClass))
      .filter(
        (c) =>
          c.contractClass != null &&
          supportedContractClasses.includes(c.contractClass)
      )
      .map((c) => ({
        id: c.id,
        accountId: c.accountId,
        address: c.address,
        contractClass: c.contractClass,
        type: c.contractType,
        contractNo: c.contractNum,
        planName: c.planName,
        rateCategory: c.rateCategory,
      }));
  }

  protected setTokenFromHeader(value: string | undefined | null) {
    if (value == null) {
      return this.clearToken();
    }

    if (!value.startsWith('Bearer ')) {
      logger.error('Not valid "Authorization" header value received', NS);

      return this.clearToken();
    }

    const token = value.substring(7);

    if (token.length === 0) {
      logger.error('Empty "Authorization" header value received', NS);

      return this.clearToken();
    }

    if (token != this.#apiToken) {
      logger.debug('New token received', NS);

      this.#apiToken = token;

      this.#eventBus.emitTepcoNewToken(token);
    }
  }

  protected clearToken() {
    logger.debug('Token cleared', NS);

    this.#eventBus.emitTepcoTokenReset();
  }

  protected async setTrackedContracts(contracts: TrackedContract[]) {
    const initialSet = this.#trackedContracts == null;
    this.#trackedContracts = contracts;

    if (initialSet) {
      for (const c of this.#trackedContracts) {
        await this.haPublishContractDiscover(c);
        await this.haPublishCachedState(c);
      }
    }

    const cache = new Map();

    if (this.#cachedUsages != null) {
      for (const c of this.#trackedContracts) {
        if (this.#cachedUsages.has(c.id)) {
          cache.set(c.id, this.#cachedUsages.get(c.id));
        }
      }
    }

    this.#cachedUsages = cache;
  }

  protected async increaseError() {
    this.#errorCount += 1;

    if (this.#errorCount >= settings.get().tepco.maxErrorCount) {
      logger.error(
        `Maximum error count ${this.#errorCount} reached. Stopping`,
        NS
      );

      await this.stop();
      this.#eventBus.emitTepcoMaximumErrorCountReached();
    }
  }

  protected async apiRequestGet<T>(url: string): Promise<MakeResponse<T>> {
    const id = crypto.randomUUID();

    if (this.#apiToken == null) {
      this.#apiToken = null;

      throw new Error('Token is not set');
    }

    const fullUrl = `https://kcx-api.tepco-z.com/kcx${url}`;
    const request = {
      headers: {
        accept: 'application/json; charset=utf-8',
        authorization: `Bearer ${this.#apiToken}`,
        'content-type': 'application/json',
        'x-api-request-id': id,
        'x-kcx-tracking-id': id,
        Referer: 'https://www.app.kurashi.tepco.co.jp/',
        DNT: '1',
      },
      method: 'GET',
    };
    const res = await fetch(fullUrl, request);

    if (res.ok) {
      if (res.headers.get('content-type')?.includes('json')) {
        return (await res.json()) as MakeResponse<T>;
      }

      throw new Error(`Unknown response type: ${res}`);
    }

    console.error(fullUrl, request, res, await res.text());
    throw new Error(`Request (${fullUrl} failed: ${res.status}`);
  }
}
