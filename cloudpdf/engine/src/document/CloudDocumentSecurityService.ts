import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  checkCapability,
  decodePdfBits,
  expandRawScope,
  passwordPromptFromState,
  securityStateFromHead,
  type DocCapability,
  type DocumentAccessInfo,
  type DocumentIdentity,
  type DocumentSecurityService,
  type DocumentSecurityState,
  type DocumentUnlockInput,
  type DocumentUnlockResult,
  type PasswordPrompt,
} from '@embedpdf/engine-core/runtime';
import { AccessResponseSchema, wirePaths, type DocumentHead } from '@embedpdf/engine-core/wire';

import { decodeUnverifiedClaims } from '../transport/decodeUnverifiedClaims';
import type { HttpClient } from '../transport/HttpClient';

export class CloudDocumentSecurityService implements DocumentSecurityService {
  private state: DocumentSecurityState;
  private access: DocumentAccessInfo | null = null;

  /**
   * Parsed JWT identity + scope, decoded once at construction. Used by
   * the local-fallback path for `effectiveScope` and `identity` when
   * /access hasn't run yet (public-share with no CDN, password not
   * yet supplied, etc.).
   */
  private readonly tokenScope: ReadonlyArray<string>;
  private readonly tokenIdentity: DocumentIdentity | null;

  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    initialHead: DocumentHead,
    private readonly view: { isClosed(): boolean },
    initialToken: string | null = null,
  ) {
    this.state = securityStateFromHead(initialHead);
    const claims = initialToken ? safeDecodeClaims(initialToken) : null;
    this.tokenScope = Array.isArray(claims?.scope) ? (claims!.scope as ReadonlyArray<string>) : [];
    this.tokenIdentity = claims ? identityFromClaims(claims) : null;
  }

  get current(): DocumentSecurityState {
    return this.state;
  }

  get currentAccess(): DocumentAccessInfo | null {
    return this.access;
  }

  /**
   * Expanded capability set. Cloud-canonical post-/access; otherwise
   * computed locally from the JWT scope + /head's pdf bits using the
   * SAME `expandRawScope` helper engine-local calls — so the value
   * matches across engines bit-for-bit on the same inputs.
   */
  get effectiveScope(): ReadonlyArray<string> {
    if (this.access) return this.access.effectiveScope;
    const bits = decodePdfBits(this.state.permissions.bits);
    return Array.from(expandRawScope(this.tokenScope, bits)).sort();
  }

  /**
   * Wildcard-aware authorization check — mirrors what the server route layer
   * enforces with. `effectiveScope` alone can't gate UI: it enumerates concrete
   * grants and drops the `*` admin wildcard. So we honor a server-canonical
   * concrete grant when present, then fall back to the same `checkCapability`
   * predicate (which short-circuits `*`) against the JWT scope + /head bits.
   */
  allows(cap: DocCapability): boolean {
    if (this.access?.effectiveScope.includes(cap)) return true;
    const bits = decodePdfBits(this.state.permissions.bits);
    return checkCapability(cap, this.tokenScope, bits);
  }

  /**
   * Identity of the current caller, or null when anonymous.
   *
   * Cloud-canonical post-/access; otherwise the identity claims from
   * the JWT itself. Both are the same shape — the post-/access
   * version is just refreshed to reflect any server-side identity
   * augmentation (rare; reserved for future tenant hooks).
   */
  get identity(): DocumentIdentity | null {
    return this.access?.identity ?? this.tokenIdentity;
  }

  /**
   * High-level "should I prompt for a password?" — single source of
   * truth, computed via `passwordPromptFromState` so the answer is
   * identical to what the local engine would say for the same
   * security state. See `passwordPromptFromState` for the rules.
   */
  get passwordPrompt(): PasswordPrompt {
    return passwordPromptFromState(this.state);
  }

  unlock(input: DocumentUnlockInput): AbortablePromise<DocumentUnlockResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<DocumentUnlockResult>(async (signal) => {
      return await this.postAccess(signal, {
        password: input.password,
        mode: input.mode ?? 'any',
      });
    });
  }

  /**
   * Cloud-internal: call /v1/access with no password to establish
   * a CDN-credentialed session. Used by `CloudEngine.open` when
   * /head's `access.reasons` includes 'cdn' but NOT 'password' —
   * the server accepts an authenticated /access POST without a
   * password and returns the signed-URL block.
   *
   * Not on the public `DocumentSecurityService` interface — the
   * "unlock" verb implies user action, and this path is automatic.
   * Local engine has no equivalent (there's no CDN concept).
   */
  establishAccess(): AbortablePromise<DocumentUnlockResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<DocumentUnlockResult>(async (signal) => {
      return await this.postAccess(signal, { mode: 'any' });
    });
  }

  /**
   * Single POST /v1/access implementation shared by `unlock()` (with
   * password) and `establishAccess()` (no password). Updates cached
   * security state, caches the access block, and pushes the CDN
   * binding into the HttpClient so subsequent fetches apply CDN
   * tokens via `applyCdnAccess`.
   *
   * `none` CDN adapter → the access block has null overrides/policies
   * and `applyCdnAccess` short-circuits to origin; safe to call always.
   */
  private async postAccess(
    signal: AbortSignal,
    body: { password?: string; mode: 'any' | 'owner' },
  ): Promise<DocumentUnlockResult> {
    const response = await this.http.postJson(
      // Identity rides the PATH — doc and layer, like every layer route;
      // the affinity tier pins the session bootstrap to the document's
      // pod from the very first request.
      wirePaths.access(this.docId, this.layerName),
      {
        ...(body.password ? { password: body.password } : {}),
        mode: body.mode,
      },
      (raw) => AccessResponseSchema.parse(raw),
      signal,
    );
    this.state = response.security;
    this.access = {
      cdn: response.cdn,
      passwordGrant: response.passwordGrant,
      pdfPermissions: response.pdfPermissions,
      scope: response.scope,
      effectiveScope: response.effectiveScope,
      identity: response.identity,
      originPasswordPolicy: response.originPasswordPolicy,
      expiresAt: response.expiresAt,
      // Deployment render lattice. Absent on older servers without render policy support.
      ...(response.renderPolicy ? { renderPolicy: response.renderPolicy } : {}),
    };
    this.http.setCdnAccess({
      cdn: response.cdn,
      docId: this.docId,
      layerName: this.layerName,
    });
    // DocumentUnlockResult.access is `DocumentAccessInfo | undefined`,
    // not `| null`. We carry the local cache as `| null` (clearer
    // "not yet unlocked" semantic); coerce at the boundary.
    return { security: this.state, access: this.access ?? undefined };
  }
}

/**
 * Decode the JWT's payload without verifying. The SDK never verifies
 * tokens client-side — the server is the verifier of record — but it
 * needs the `scope` and identity claims for the local-fallback path
 * of `effectiveScope` / `identity`. Returns null if the token is
 * malformed; the security service treats that as "no claims known".
 */
function safeDecodeClaims(token: string): Record<string, unknown> | null {
  try {
    return decodeUnverifiedClaims(token);
  } catch {
    return null;
  }
}

function identityFromClaims(claims: Record<string, unknown>): DocumentIdentity | null {
  const out: DocumentIdentity = {};
  if (typeof claims['user_id'] === 'string') out.user_id = claims['user_id'];
  if (typeof claims['group_id'] === 'string') out.group_id = claims['group_id'];
  if (typeof claims['display_name'] === 'string') out.display_name = claims['display_name'];
  if (Array.isArray(claims['groups'])) {
    const groups = (claims['groups'] as unknown[]).filter(
      (g): g is string => typeof g === 'string',
    );
    if (groups.length > 0) out.groups = groups;
  }
  return Object.keys(out).length > 0 ? out : null;
}
