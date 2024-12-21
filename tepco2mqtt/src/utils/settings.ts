import type { KeyValue, RecursivePartial, SettingsSchema } from '../types';
import path from 'path';
import data from './data';
import yaml, { YAMLFileException } from './yaml';
import schemaJson from './settings.schema.json';
import objectAssignDeep from 'object-assign-deep';
import { minutes } from './utils';
import Ajv from 'ajv';
import fs from 'fs';

export let schema: KeyValue = schemaJson;

schema = {};
objectAssignDeep(schema, schemaJson);

const ajvSetting = new Ajv({ allErrors: true })
  .addKeyword('requiresRestart')
  .compile(schemaJson);

const ajvRestartRequired = new Ajv({ allErrors: true })
  .addKeyword({ keyword: 'requiresRestart', validate: (s: unknown) => !s })
  .compile(schemaJson);

const defaults: RecursivePartial<SettingsSchema> = {
  homeassistant: {
    discovery_topic: 'homeassistant',
    status_topic: 'homeassistant/status'
  },
  mqtt: {
    base_topic: 'tepco2mqtt',
  },
  browser: {
    // userDataDir: path.join(data.getPath(), 'chromium'),
    headless: true,
    interval: 300,
    timeout: 300,
    additionalArgs: [],
  },
  tepco: {
    interval: 300,
    initialRun: true,
    contractIds: [],
    maxErrorCount: 10,
  },
  advanced: {
    log_rotation: true,
    log_symlink_current: false,
    log_output: ['console', 'file'],
    log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
    log_file: 'log.log',
    log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
    log_namespaced_levels: {},
    log_debug_namespace_ignore: '',
    log_syslog: {},
    timestamp_format: 'YYYY-MM-DD HH:mm:ss',
    output: 'json',
  },
};

class Settings {
  #file: string;

  #settings: Partial<SettingsSchema> | undefined;
  #settingsWithDefaults: SettingsSchema | undefined;

  constructor() {
    this.#file =
      process.env.TEPCO2MQTT_CONFIG ?? data.joinPath('configuration.yaml');
  }

  public get(): SettingsSchema {
    if (!this.#settingsWithDefaults) {
      this.load();
    }

    return this.#settingsWithDefaults!;
  }

  public reRead() {
    this.#settings = undefined;

    this.getInternals();

    this.#settingsWithDefaults = undefined;

    this.get();
  }

  public validate(): string[] {
    try {
      this.getInternals();
    } catch (error) {
      if (error instanceof YAMLFileException) {
        return [
          `Your YAML file: '${error.file}' is invalid (use https://jsonformatter.org/yaml-validator to find and fix the issue)`,
        ];
      }

      return [`${error}`];
    }

    if (!ajvSetting(this.#settings)) {
      // When `ajvSetting()` return false it always has `errors`.
      return ajvSetting.errors!.map(
        (v) => `${v.instancePath.substring(1)} ${v.message}`
      );
    }

    return [];
  }

  protected getInternals() {
    if (!this.#settings) {
      this.#settings = this.read();
    }

    return this.#settings;
  }

  protected load() {
    if (!this.#settings) {
      this.#settings = this.read();
    }

    this.#settingsWithDefaults = objectAssignDeep(
      {},
      defaults,
      this.getInternals()
    );

    if (this.#settingsWithDefaults.homeassistant) {
      const defaults = {
        discovery_topic: 'homeassistant',
        status_topic: 'hass/status',
      };
      const s =
        typeof this.#settingsWithDefaults.homeassistant === 'object'
          ? this.#settingsWithDefaults.homeassistant
          : {};
      // @ts-expect-error ignore typing
      this.#settingsWithDefaults.homeassistant = {};

      objectAssignDeep(this.#settingsWithDefaults.homeassistant, defaults, s);
    }
  }

  protected read(): SettingsSchema {
    if (!fs.existsSync(this.#file)) {
      throw new Error(`Configuration file not found: ${this.#file}`);
    }

    const s = yaml.read<SettingsSchema>(this.#file);

    this.applyEnvironmentVariables(s);

    // Read !secret MQTT username and password if set
    const interpretValue = <T>(value: T): T => {
      if (typeof value === 'string') {
        const ref = this.parseValueRef(value);

        if (ref) {
          return yaml.read<KeyValue>(data.joinPath(ref.filename))[ref.key] as T;
        }
      }
      return value;
    };

    if (s.mqtt?.username) {
      s.mqtt.username = interpretValue(s.mqtt.username);
    }

    if (s.mqtt?.password) {
      s.mqtt.password = interpretValue(s.mqtt.password);
    }

    if (s.mqtt?.server) {
      s.mqtt.server = interpretValue(s.mqtt.server);
    }

    return s;
  }

  private applyEnvironmentVariables(settings: Partial<SettingsSchema>): void {
    const iterate = (obj: KeyValue, path: string[]): void => {
      for (const key in obj) {
        if (key !== 'type') {
          if (key !== 'properties' && obj[key]) {
            const type = (obj[key].type || 'object').toString();
            const envPart = path.reduce((acc, val) => `${acc}${val}_`, '');
            const envVariableName =
              `TEPCO2MQTT_CONFIG_${envPart}${key}`.toUpperCase();
            const envVariable = process.env[envVariableName];

            if (envVariable) {
              const setting = path.reduce((acc, val) => {
                acc[val] = acc[val] || {};
                return acc[val];
              }, settings);

              if (type.indexOf('object') >= 0 || type.indexOf('array') >= 0) {
                try {
                  setting[key] = JSON.parse(envVariable);
                } catch {
                  setting[key] = envVariable;
                }
              } else if (type.indexOf('number') >= 0) {
                setting[key] = (envVariable as unknown as number) * 1;
              } else if (type.indexOf('boolean') >= 0) {
                setting[key] = envVariable.toLowerCase() === 'true';
              } else {
                /* istanbul ignore else */
                if (type.indexOf('string') >= 0) {
                  setting[key] = envVariable;
                }
              }
            }
          }

          if (typeof obj[key] === 'object' && obj[key]) {
            const newPath = [...path];

            if (
              key !== 'properties' &&
              key !== 'oneOf' &&
              !Number.isInteger(Number(key))
            ) {
              newPath.push(key);
            }

            iterate(obj[key], newPath);
          }
        }
      }
    };

    iterate(schemaJson.properties, []);
  }

  private parseValueRef(
    text: string
  ): { filename: string; key: string } | null {
    const match = /!(.*) (.*)/g.exec(text);

    if (match) {
      let filename = match[1];
      // This is mainly for backward compatibility.
      if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
        filename += '.yaml';
      }

      return { filename, key: match[2] };
    } else {
      return null;
    }
  }
}

export const settings = new Settings();

export default settings;
