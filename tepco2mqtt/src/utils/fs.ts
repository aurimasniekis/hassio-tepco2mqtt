import path from 'path';
import fs, { MakeDirectoryOptions } from 'fs';

export function mkdirSync(root: string, mode: MakeDirectoryOptions = {}) {
  if (typeof root !== 'string') {
    throw new Error('missing root');
  }

  const chunks = root.split(path.sep); // split in chunks
  let chunk: string;
  if (path.isAbsolute(root) === true) {
    // build from absolute path
    chunk = chunks.shift(); // remove "/" or C:/
    if (!chunk) {
      // add "/"
      chunk = path.sep;
    }
  } else {
    chunk = path.resolve(); // build with relative path
  }

  return mkdirSyncRecursive(chunk, chunks, mode);
}

function mkdirSyncRecursive(root: string, chunks: string[], mode: MakeDirectoryOptions = {}) {
  const chunk = chunks.shift();

  if (!chunk) {
    return;
  }

  root = path.join(root, chunk);

  if (fs.existsSync(root) === true) {
    // already done
    return mkdirSyncRecursive(root, chunks, mode);
  }

  const err = fs.mkdirSync(root, mode);

  return err ? err : mkdirSyncRecursive(root, chunks, mode); // let's magic
}
