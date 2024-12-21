import path from 'path';
import * as url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setPath(): string {
  return process.env.TEPCO2MQTT_DATA
    ? process.env.TEPCO2MQTT_DATA
    : path.normalize(path.join(__dirname, '..', '..', 'data'));
}

let dataPath = setPath();

function joinPath(file: string): string {
  return path.resolve(dataPath, file);
}

function getPath(): string {
  return dataPath;
}

function _testReload(): void {
  dataPath = setPath();
}

export default { joinPath, getPath, _testReload };
