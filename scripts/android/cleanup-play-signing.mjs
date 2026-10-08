import { unlink, rmdir } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
const file = process.env.PLUTO_UPLOAD_KEYSTORE;
if (file) {
  const target = resolve(file), root = resolve(process.env.RUNNER_TEMP) + sep;
  if (!target.startsWith(root) || !basename(dirname(target)).startsWith('pluto-android-signing-') || basename(target) !== 'upload.jks') throw new Error('Refusing to remove an unexpected signing path.');
  await unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(dirname(target)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
