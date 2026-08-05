import type {
  SecretRef,
  SecretsProvider,
  SecretsProviderInfo,
  SecretValue,
} from './SecretsProvider';

export interface CachingSecretsProviderOptions {
  ttlMs: number;
}

/**
 * TTL-cache decorator. Wraps any `SecretsProvider`, caches successful
 * lookups for `ttlMs`, and forwards `invalidate` to both the cache and
 * the inner provider.
 *
 * The `info` shape carries the inner's full identity plus
 * `cached: true` and the configured `ttlMs` — so an `/admin/status`
 * endpoint can show "this provider is wrapped in a 5-minute cache"
 * without forcing callers to special-case the decorator.
 */
export class CachingSecretsProvider implements SecretsProvider {
  readonly info: SecretsProviderInfo;
  private readonly cache = new Map<string, { value: SecretValue; expiresAt: number }>();

  constructor(
    private readonly inner: SecretsProvider,
    private readonly opts: CachingSecretsProviderOptions,
  ) {
    this.info = { ...inner.info, cached: true, ttlMs: opts.ttlMs };
  }

  async get(ref: SecretRef): Promise<SecretValue> {
    const key = cacheKey(ref);
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.inner.get(ref);
    this.cache.set(key, { value, expiresAt: now + this.opts.ttlMs });
    return value;
  }

  invalidate(ref: SecretRef): void {
    this.cache.delete(cacheKey(ref));
    this.inner.invalidate(ref);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

function cacheKey(ref: SecretRef): string {
  return JSON.stringify({
    provider: ref.provider,
    name: ref.name,
    jsonKey: ref.jsonKey ?? null,
    encoding: ref.encoding ?? null,
    version: ref.version ?? null,
    versionStage: ref.versionStage ?? null,
  });
}
