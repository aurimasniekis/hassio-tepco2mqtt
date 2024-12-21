import type { LoggerLevel } from './utils/logger';
import type { QoS } from 'mqtt-packet';

export type RecursivePartial<T> = {[P in keyof T]?: RecursivePartial<T[P]>};

export interface KeyValue {
  [s: string]: any;
}

export interface SettingsSchema {
  homeassistant?: {
    discovery_topic: string;
    status_topic: string;
  };
  browser: {
    userDataDir?: string;
    headless?: boolean;
    executablePath?: string;
    interval?: number;
    timeout?: number;
    additionalArgs?: string[];
  }
  tepco: {
    interval?: number;
    email: string;
    password: string;
    initialRun?: boolean;
    contractIds?: string[];
    maxErrorCount?: number;
  },
  mqtt: {
    base_topic: string;
    force_disable_retain: boolean;
    username?: string;
    password?: string;
    server: string;
    ca?: string;
    keepalive?: number;
    key?: string;
    cert?: string;
    client_id?: string;
    reject_unauthorized?: boolean;
    version?: 3 | 4 | 5;
  };
  advanced: {
    log_rotation: boolean;
    log_symlink_current: boolean;
    log_output: ('console' | 'file' | 'syslog')[];
    log_directory: string;
    log_file: string;
    log_level: LoggerLevel;
    log_namespaced_levels: Record<string, LoggerLevel>;
    log_debug_namespace_ignore: string;
    log_syslog: KeyValue;
    timestamp_format: string;
    output: 'json' | 'attribute' | 'attribute_and_json';
  };
}

export interface MQTTOptions {
  qos?: QoS;
  retain?: boolean;
  properties?: {messageExpiryInterval: number};
}
