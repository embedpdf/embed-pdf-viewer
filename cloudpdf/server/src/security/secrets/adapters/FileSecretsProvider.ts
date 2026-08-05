import { readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import {
  decodeSecretBytes,
  SecretNotFound,
  SecretProviderUnreachable,
  type SecretRef,
  type SecretsProvider,
  type SecretValue,
} from '../SecretsProvider';

export interface FileSecretsProviderOptions {
  root: string;
}

export class FileSecretsProvider implements SecretsProvider {
  readonly info: { kind: 'file'; root: string };
  private readonly root: string;

  constructor(opts: FileSecretsProviderOptions) {
    this.root = resolve(opts.root);
    this.info = { kind: 'file', root: this.root };
  }

  async get(ref: SecretRef): Promise<SecretValue> {
    const path = this.resolveName(ref.name);
    try {
      const raw = await readFile(path);
      if (raw.byteLength === 0) throw new SecretNotFound(ref, this.info.kind);
      return {
        bytes: decodeSecretBytes(raw, ref),
        fetchedAt: new Date(),
      };
    } catch (err) {
      if (err instanceof SecretNotFound) throw err;
      if (isNodeError(err, 'ENOENT')) throw new SecretNotFound(ref, this.info.kind);
      throw new SecretProviderUnreachable(this.info.kind, err);
    }
  }

  invalidate(_ref: SecretRef): void {
    // File values are read from disk on every uncached get.
  }

  private resolveName(name: string): string {
    const path = resolve(this.root, name);
    const rel = relative(this.root, path);
    if (rel.startsWith('..') || rel === '..' || rel.includes(`..${sep}`) || rel === '') {
      throw new Error(`file secret name must stay within root: ${name}`);
    }
    return path;
  }
}

function isNodeError(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === code;
}
