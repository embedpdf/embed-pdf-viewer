/**
 * Node-ONLY target detection. `detect-libc` (musl vs glibc for the native
 * addons) requires Node builtins at module load, so this file may only appear
 * in the `node` export condition's graph — never in the browser entry.
 */
import { familySync, GLIBC, MUSL } from 'detect-libc';
import { isNodeLike, type RuntimeTarget } from './platform';

export function resolveRuntimeTarget(): RuntimeTarget | null {
  if (!isNodeLike()) return 'wasm32';

  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'win32' && arch === 'arm64') return 'win32-arm64';
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';

  if (platform === 'linux') {
    const libc = familySync();
    const isMusl = libc === MUSL;
    const isGlibc = libc === GLIBC || libc == null;

    if (arch === 'arm64') return isMusl ? 'linuxmusl-arm64' : isGlibc ? 'linux-arm64' : null;
    if (arch === 'x64') return isMusl ? 'linuxmusl-x64' : isGlibc ? 'linux-x64' : null;
  }

  return null;
}
