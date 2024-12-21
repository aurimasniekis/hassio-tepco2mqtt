import { Controller } from './controller';
import path from 'path';
import fs from 'fs';
import git from 'git-last-commit';
import semver from 'semver';
import packageJson from '../package.json';
import settings from './utils/settings';
import url from 'node:url';

let controller: Controller;
let stopping = false;
let watchdog = process.env.T2M_WATCHDOG != undefined;
let watchdogCount = 0;
let unsolicitedStop = false;

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// csv in minutes, default: 1min, 5min, 15min, 30min, 60min
let watchdogDelays = [2000, 60000, 300000, 900000, 1800000, 3600000];

if (watchdog && process.env.T2M_WATCHDOG !== 'default') {
  if (
    /^(?:(?:[0-9]*[.])?[0-9]+)+(?:,?(?:[0-9]*[.])?[0-9]+)*$/.test(
      process.env.T2M_WATCHDOG
    )
  ) {
    watchdogDelays = process.env.T2M_WATCHDOG.split(',').map(
      (v) => parseFloat(v) * 60000
    );
  } else {
    console.log(
      `Invalid watchdog delays (must use number-only CSV format representing minutes, example: 'T2M_WATCHDOG=1,5,15,30,60'.`
    );

    process.exit(1);
  }
}


async function triggerWatchdog(code) {
  const delay = watchdogDelays[watchdogCount];
  watchdogCount += 1;

  if (delay) {
    // garbage collector
    controller = undefined;

    console.log(`WATCHDOG: Waiting ${delay / 60000}min before next start try.`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await start();
  } else {
    process.exit(code);
  }
}

export async function restart() {
  await stop(0, true);
  await start();
}

async function exit(code: number, restart = false) {
  if (!restart) {
    if (watchdog && unsolicitedStop) {
      await triggerWatchdog(code);
    } else {
      process.exit(code);
    }
  }
}

async function currentHash() {
  return new Promise<string>((resolve) => {
    git.getLastCommit((err, commit) =>
      err ? resolve('unknown') : resolve(commit.shortHash)
    );
  });
}

export async function start() {
  console.log(
    `Starting Tepco2MQTT ${
      watchdog ? `with watchdog (${watchdogDelays})` : `without watchdog`
    }.`
  );

  const version = packageJson.engines.node;

  if (!semver.satisfies(process.version, version)) {
    console.log(
      `\t\tTepco2MQTT requires node version ${version}, you are running ${process.version}!\n`
    );
  }

  settings.reRead();

  const errors = settings.validate();

  if (errors.length > 0) {
    unsolicitedStop = false;

    console.log(`\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.log('            READ THIS CAREFULLY\n');
    console.log(
      `Refusing to start because configuration is not valid, found the following errors:`
    );

    for (const error of errors) {
      console.log(`- ${error}`);
    }

    console.log(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n`);

    return exit(1);
  }

  controller = new Controller(restart, exit);

  await controller.start();

  // consider next controller.stop() call as unsolicited, only after successful first start
  unsolicitedStop = true;
  watchdogCount = 0; // reset
}

export async function stop(code = 0, restart = false) {
  // `handleQuit` or `restart` never unsolicited
  unsolicitedStop = false;

  await controller.stop(code, restart);
}

async function handleQuit() {
  if (!stopping) {
    if (controller) {
      stopping = true;

      await stop(0, false);
    } else {
      process.exit(0);
    }
  }
}

export function registerSignalHandlers() {
  process.on('SIGINT', handleQuit);
  process.on('SIGTERM', handleQuit);
}
