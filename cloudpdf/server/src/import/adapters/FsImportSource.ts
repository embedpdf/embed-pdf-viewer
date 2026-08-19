/**
 * Filesystem import source — reads one file from an operator-
 * configured root on the SERVER HOST. The bytes are trivial; the
 * containment is the security-critical surface, because the blast
 * radius of an escape is the server's own disk:
 *
 *   - keys are '/'-separated relative paths: absolute keys,
 *     backslashes, and '.'/'..' segments are refused outright;
 *   - after joining, the file's REALPATH must still live under the
 *     root's realpath — this is the symlink-escape defense (a
 *     symlink inside the root pointing outside it is refused);
 *   - fs connections are api-token only, enforced STRUCTURALLY at
 *     config parse (schema invariant), not here;
 *   - revisions are not supported — pin content with expected.sha256.
 */
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

import type { FsImportConnection } from '../config/ImportConnectionSchema';
import type { ImportPolicy } from '../config/ImportPolicySchema';
import {
  ImportSourceError,
  type ImportSource,
  type ImportSourceInfo,
  type ImportSourceOpen,
} from '../ImportSource';

export interface FsImportSourceOptions {
  connection: FsImportConnection;
  key: string;
  revision?: string | undefined;
  policy: ImportPolicy;
}

export class FsImportSource implements ImportSource {
  readonly info: ImportSourceInfo;
  private readonly segments: string[];

  constructor(private readonly opts: FsImportSourceOptions) {
    if (opts.revision !== undefined) {
      throw new ImportSourceError(
        'unsupported',
        'filesystem connections do not support revisions; pin content with expected.sha256',
        false,
      );
    }
    if (opts.key.includes('\\')) {
      throw new ImportSourceError('policy', 'fs keys must use forward slashes', false);
    }
    if (opts.key.startsWith('/')) {
      throw new ImportSourceError(
        'policy',
        'fs keys must be relative to the connection root',
        false,
      );
    }
    const segments = opts.key.split('/');
    if (segments.some((s) => s === '' || s === '.' || s === '..')) {
      throw new ImportSourceError(
        'policy',
        "fs keys must not contain empty, '.' or '..' segments",
        false,
      );
    }
    this.segments = segments;
    this.info = {
      kind: 'fs',
      location: `${opts.connection.root}/${opts.key}`,
      connectionId: opts.connection.id,
    };
  }

  async open(opts: { signal: AbortSignal }): Promise<ImportSourceOpen> {
    if (opts.signal.aborted) {
      throw new ImportSourceError(
        'upstream',
        'import timed out or was aborted before reading the source',
        true,
      );
    }
    let rootReal: string;
    try {
      rootReal = await realpath(this.opts.connection.root);
    } catch {
      throw new ImportSourceError(
        'upstream',
        `import connection root is not accessible on this host`,
        true,
      );
    }
    const joined = join(rootReal, ...this.segments);
    let fileReal: string;
    try {
      fileReal = await realpath(joined);
    } catch (err) {
      throw mapFsImportError(err, this.info.location);
    }
    // The symlink-escape defense: whatever the path RESOLVES to must
    // still live under the resolved root.
    if (fileReal !== rootReal && !fileReal.startsWith(rootReal + sep)) {
      throw new ImportSourceError(
        'denied',
        `source path escapes the connection root at ${this.info.location}`,
        false,
      );
    }
    let st;
    try {
      st = await stat(fileReal);
    } catch (err) {
      throw mapFsImportError(err, this.info.location);
    }
    if (!st.isFile()) {
      throw new ImportSourceError(
        'unsupported',
        `source path at ${this.info.location} is not a regular file`,
        false,
      );
    }
    if (st.size < 1) {
      throw new ImportSourceError(
        'unsupported',
        `source object at ${this.info.location} is empty; imports require at least one byte`,
        false,
      );
    }
    if (st.size > this.opts.policy.maxBytes) {
      throw new ImportSourceError(
        'too_large',
        `source declares ${st.size} bytes; this deployment caps imports at ${this.opts.policy.maxBytes}`,
        false,
      );
    }
    return { body: createReadStream(fileReal), contentLength: st.size };
  }
}

function mapFsImportError(err: unknown, location: string): ImportSourceError {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new ImportSourceError('not_found', `source object not found at ${location}`, false);
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new ImportSourceError('denied', `source refused access (${code}) at ${location}`, false);
  }
  if (code === 'EISDIR') {
    return new ImportSourceError(
      'unsupported',
      `source path at ${location} is not a regular file`,
      false,
    );
  }
  return new ImportSourceError(
    'upstream',
    `could not read source: ${code ?? 'filesystem error'}`,
    true,
  );
}
