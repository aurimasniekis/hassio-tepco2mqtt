import assert from 'assert';
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import moment from 'moment';
import { rimrafSync } from 'rimraf';
import settings from './settings';
import type { KeyValue } from '../types';
import { mkdirSync } from './fs';

export const LoggerLevel = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  http: 'http',
  verbose: 'verbose',
  debug: 'debug',
  silly: 'silly',
} as const;

export const LoggerLevelPriority = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

export type LoggerLevel = keyof typeof LoggerLevel;

const NAMESPACE_SEPARATOR = ':';

class Logger {
  private level: LoggerLevel;
  private output: string[];
  private directory: string;
  private logger: winston.Logger;
  private fileTransport: winston.transports.FileTransportInstance;
  private debugNamespaceIgnoreRegex?: RegExp;
  private namespacedLevels: Record<string, LoggerLevel>;
  private cachedNamespacedLevels: Record<string, LoggerLevel>;

  public async init(): Promise<void> {
    // What transports to enable
    this.output = settings.get().advanced.log_output;
    // Directory to log to
    const timestamp = moment(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
    this.directory = settings
      .get()
      .advanced.log_directory.replace('%TIMESTAMP%', timestamp);
    const logFilename = settings
      .get()
      .advanced.log_file.replace('%TIMESTAMP%', timestamp);

    this.setLevel(settings.get().advanced.log_level);
    this.setNamespacedLevels(settings.get().advanced.log_namespaced_levels);

    this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);

    const timestampFormat = (): string =>
      moment().format(settings.get().advanced.timestamp_format);

    this.logger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp({ format: timestampFormat })
      ),
      levels: winston.config.syslog.levels,
    });

    const consoleSilenced = !this.output.includes('console');
    // Print to user what logging is active
    let logging = `Logging to console${consoleSilenced ? ' (silenced)' : ''}`;

    // Setup default console logger
    this.logger.add(
      new winston.transports.Console({
        silent: consoleSilenced,
        // winston.config.syslog.levels sets 'warning' as 'red'
        format: winston.format.combine(
          winston.format.colorize({
            colors: {
              debug: 'blue',
              info: 'green',
              warning: 'yellow',
              error: 'red',
            },
          }),
          winston.format.printf(
            /* istanbul ignore next */ (info) => {
              return `[${info.timestamp}] ${info.level}: \t${info.message}`;
            }
          )
        ),
      })
    );

    if (this.output.includes('file')) {
      logging += `, file (filename: ${logFilename})`;

      // Make sure that log directory exists when not logging to stdout only
      mkdirSync(this.directory);

      if (settings.get().advanced.log_symlink_current) {
        const current = settings.get().advanced.log_directory.replace('%TIMESTAMP%', 'current');
        const actual = './' + timestamp;
        /* istanbul ignore next */
        if (fs.existsSync(current)) {
          fs.unlinkSync(current);
        }
        fs.symlinkSync(actual, current);
      }

      // Add file logger when enabled
      // NOTE: the initiation of the logger even when not added as transport tries to create the logging directory
      const transportFileOptions: winston.transports.FileTransportOptions = {
        filename: path.join(this.directory, logFilename),
        format: winston.format.printf(
          /* istanbul ignore next */ (info) => {
            return `[${info.timestamp}] ${info.level}: \t${info.message}`;
          },
        ),
      };

      // Make sure that log directory exists when not logging to stdout only
      if (settings.get().advanced.log_rotation) {
        transportFileOptions.tailable = true;
        transportFileOptions.maxFiles = 3; // Keep last 3 files
        transportFileOptions.maxsize = 10000000; // 10MB
      }

      this.fileTransport = new winston.transports.File(transportFileOptions);
      this.logger.add(this.fileTransport);
    }

    /* istanbul ignore next */
    if (this.output.includes('syslog')) {
      logging += `, syslog`;

      const winstonSyslog = await import('winston-syslog');

      const options: KeyValue = {
        app_name: 'Tepco2MQTT',
        format: winston.format.printf((info) => info.message as string),
        ...settings.get().advanced.log_syslog,
      };

      if (options['type'] !== undefined) {
        options.type = options.type.toString();
      }

      this.logger.add(new winstonSyslog.Syslog(options));
    }

    this.setDebugNamespaceIgnore(
      settings.get().advanced.log_debug_namespace_ignore
    );

    this.info(logging);
  }

  get winston(): winston.Logger {
    return this.logger;
  }

  public addTransport(transport: winston.transport): void {
    this.logger.add(transport);
  }

  public removeTransport(transport: winston.transport): void {
    this.logger.remove(transport);
  }

  public getDebugNamespaceIgnore(): string {
    return (
      this.debugNamespaceIgnoreRegex
        ?.toString()
        .slice(1, -1) /* remove slashes */ ?? ''
    );
  }

  public setDebugNamespaceIgnore(value: string): void {
    this.debugNamespaceIgnoreRegex =
      value != '' ? new RegExp(value) : undefined;
  }

  public getLevel(): LoggerLevel {
    return this.level;
  }

  public setLevel(level: LoggerLevel): void {
    this.assertLogLevel(level);

    this.level = level;
    this.resetCachedNamespacedLevels();
  }

  public getNamespacedLevels(): Record<string, LoggerLevel> {
    return this.namespacedLevels;
  }

  public setNamespacedLevels(nsLevels: Record<string, LoggerLevel>): void {
    for (const ns in nsLevels) {
      this.assertLogLevel(nsLevels[ns]);
    }

    this.namespacedLevels = nsLevels;
    this.resetCachedNamespacedLevels();
  }

  private resetCachedNamespacedLevels(): void {
    this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);
  }

  private cacheNamespacedLevel(namespace: string): string {
    let cached = namespace;

    while (this.cachedNamespacedLevels[namespace] == undefined) {
      const sep = cached.lastIndexOf(NAMESPACE_SEPARATOR);

      if (sep === -1) {
        return (this.cachedNamespacedLevels[namespace] = this.level);
      }

      cached = cached.slice(0, sep);
      this.cachedNamespacedLevels[namespace] =
        this.cachedNamespacedLevels[cached];
    }

    return this.cachedNamespacedLevels[namespace];
  }

  private log(
    level: LoggerLevel,
    messageOrLambda: string | (() => string),
    namespace: string
  ): void {
    this.assertLogLevel(level);

    if (level === 'warn') {
      level = 'warning' as LoggerLevel;
    }

    const nsLevel = this.cacheNamespacedLevel(namespace);

    if (LoggerLevelPriority[level] <= LoggerLevelPriority[nsLevel]) {
      const message: string =
        messageOrLambda instanceof Function
          ? messageOrLambda()
          : messageOrLambda;
      this.logger.log(level, `${namespace}: ${message}`);
    }
  }

  public error(
    messageOrLambda: string | (() => string),
    namespace = 't2m'
  ): void {
    this.log('error', messageOrLambda, namespace);
  }

  public warn(
    messageOrLambda: string | (() => string),
    namespace = 't2m'
  ): void {
    this.log('warn', messageOrLambda, namespace);
  }

  public info(
    messageOrLambda: string | (() => string),
    namespace = 't2m'
  ): void {
    this.log('info', messageOrLambda, namespace);
  }

  public debug(
    messageOrLambda: string | (() => string),
    namespace = 't2m'
  ): void {
    if (this.debugNamespaceIgnoreRegex?.test(namespace)) {
      return;
    }

    this.log('debug', messageOrLambda, namespace);
  }

  // Cleanup any old log directory.
  public cleanup(): void {
    if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
      const rootDirectory = path.join(this.directory, '..');

      let directories = fs.readdirSync(rootDirectory).map((d) => {
        d = path.join(rootDirectory, d);
        return { path: d, birth: fs.statSync(d).mtime };
      });

      directories.sort((a: KeyValue, b: KeyValue) => b.birth - a.birth);
      directories = directories.slice(10, directories.length);
      directories.forEach((dir) => {
        this.debug(`Removing old log directory '${dir.path}'`);
        rimrafSync(dir.path);
      });
    }
  }

  // Workaround for https://github.com/winstonjs/winston/issues/1629.
  // https://github.com/Koenkk/zigbee2mqtt/pull/10905
  /* istanbul ignore next */
  public async end(): Promise<void> {
    this.logger.end();

    await new Promise<void>((resolve) => {
      if (!this.fileTransport) {
        process.nextTick(resolve);
      } else {
        // @ts-expect-error workaround
        if (this.fileTransport._dest) {
          // @ts-expect-error workaround
          this.fileTransport._dest.on('finish', resolve);
        } else {
          this.fileTransport.on('open', () =>
            // @ts-expect-error workaround
            this.fileTransport._dest.on('finish', resolve)
          );
        }
      }
    });
  }

  private isValidLogLevel(level: string): level is LoggerLevel {
    return level == null ? false : level in LoggerLevel;
  }

  private assertLogLevel(level: string): void {
    assert(
      this.isValidLogLevel(level),
      `'${level}' is not valid log_level, use one of '${Object.keys(
        LoggerLevel
      ).join(', ')}'`
    );
  }
}

export const logger = new Logger();

export default logger;
