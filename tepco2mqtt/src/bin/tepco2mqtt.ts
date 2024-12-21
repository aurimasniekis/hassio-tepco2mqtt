import { registerSignalHandlers, start } from '../main';

registerSignalHandlers();

await start();
