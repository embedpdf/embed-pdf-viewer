import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export function snapshotFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function restoreFile(path, snapshot) {
  if (snapshot === null) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  writeFileSync(path, snapshot);
}
