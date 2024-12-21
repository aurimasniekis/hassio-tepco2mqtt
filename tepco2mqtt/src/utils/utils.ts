import fs from 'fs';
import path from 'path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function availabilityPayload(state: 'online' | 'offline'): string {
  return JSON.stringify({ state });
}

export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}


export function hours(hours: number): number {
  return 1000 * 60 * 60 * hours;
}

export function minutes(minutes: number): number {
  return 1000 * 60 * minutes;
}

export function seconds(seconds: number): number {
  return 1000 * seconds;
}


export async function getTepco2MQTTVersion(includeCommitHash = true): Promise<{commitHash?: string; version: string}> {
  const git = await import('git-last-commit');
  const packageJSON = await import('../..' + '/package.json');

  if (!includeCommitHash) {
    return {version: packageJSON.version, commitHash: undefined};
  }

  return await new Promise((resolve) => {
    const version = packageJSON.version;

    git.getLastCommit((err: Error, commit: {shortHash: string}) => {
      let commitHash = undefined;

      if (err) {
        try {
          commitHash = fs.readFileSync(path.join(__dirname, '..', '.hash'), 'utf-8');
        } catch {
          /* istanbul ignore next */
          commitHash = 'unknown';
        }
      } else {
        commitHash = commit.shortHash;
      }

      commitHash = commitHash.trim();
      resolve({commitHash, version});
    });
  });
}
