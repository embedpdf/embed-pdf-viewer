import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  checkCapability,
  checkCollab,
  checkSetGroup,
  decodePdfBits,
  expandRawScope,
  passwordPromptFromState,
  securityStateFromHead,
  type CollabTarget,
  type DocCapability,
  type DocumentAccessInfo,
  type DocumentSecurityService,
  type DocumentSecurityState,
  type DocumentUnlockInput,
  type DocumentUnlockResult,
  type Identity,
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
  private readonly tokenIdentity: Identity | null;

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
   * same `expandRawScope` helper engine-local calls — so the value
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
   * Per-record annotation authorization mirrors — the same
   * `checkCollab`/`checkSetGroup` resolvers the server's route layer
   * enforces with, over the same inputs: the raw scope
   * (server-canonical post-/access, else the JWT's own claim), the
   * caller's identity, and /head's PDF bits. A control gated on these
   * matches the server's allow/deny for the same mutation. False
   * before any token/access context exists — fail closed, same rule
   * as `allows`.
   */
  allowsAnnotationCreate(): boolean {
    const id = this.identity ?? {};
    return checkCollab('create', selfTarget(id), this.rawScope(), id, this.pdfBits());
  }

  allowsAnnotationMutation(action: 'update' | 'delete', target: CollabTarget): boolean {
    return checkCollab(action, target, this.rawScope(), this.identity ?? {}, this.pdfBits());
  }

  allowsAnnotationGroupAssignment(groupId: string): boolean {
    return checkSetGroup(groupId, this.identity?.groupId, this.rawScope(), this.pdfBits());
  }

  /** Raw scope for the collab resolver: server-canonical post-/access, else the JWT claim. */
  private rawScope(): ReadonlyArray<string> {
    return this.access?.scope ?? this.tokenScope;
  }

  private pdfBits() {
    return decodePdfBits(this.state.permissions.bits);
  }

  /**
   * Identity of the current caller, or null when anonymous.
   *
   * Cloud-canonical post-/access; otherwise the identity claims from
   * the JWT itself. Both are the same shape — the post-/access
   * version is just refreshed to reflect any server-side identity
   * augmentation (rare; reserved for future tenant hooks).
   */
  get identity(): Identity | null {
    return this.access?.identity ?? this.tokenIdentity;
  }

  /**
   * High-level "should I prompt for a password?" — single source of
   * truth, computed via `passwordPromptFromState` so the answer is
   * identical to what the local engine would say for the same
   * security state. See `passwordPromptFromState` for the rules.
   */
  get passwordPrompt(): PasswordPrompt {
    return passwordPromptFromState(this.state, this.passwordRejected);
  }

  /** Whether the last password tried was wrong (the prompt's `incorrect`). */
  private passwordRejected = false;

  unlock(input: DocumentUnlockInput): AbortablePromise<DocumentUnlockResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<DocumentUnlockResult>(async (signal) => {
      try {
        const result = await this.postAccess(signal, {
          password: input.password,
          mode: input.mode ?? 'any',
        });
        this.passwordRejected = false;
        return result;
      } catch (error) {
        if (EngineError.is(error, EngineErrorCode.DocPasswordIncorrect)) {
          this.passwordRejected = true;
        }
        throw error;
      }
    });
  }

  /**
   * Cloud-internal: call /v1/access with no password to establish
   * a CDN-credentialed session. Used by `CloudEngine.open` when
   * /head's `access.reasons` includes 'cdn' but not 'password' —
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
      // Identity rides the path — doc and layer, like every layer route;
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

/**
 * Create's CollabTarget is the caller's own identity — the same
 * derivation as engine-local's `ScopeGuard.targetForSelfCreate`, so
 * `:self` trivially passes and `:group=X` matches the caller's
 * default group.
 */
function selfTarget(id: Identity): CollabTarget {
  return {
    ...(id.userId !== undefined ? { userId: id.userId } : {}),
    ...(id.groupId !== undefined ? { groupId: id.groupId } : {}),
  };
}

const IDENTITY_STRING_FIELDS = [
  'userId',
  'displayName',
  'email',
  'title',
  'organization',
  'organizationalUnit',
  'groupId',
] as const;

/**
 * The token's `identity` claim, read the way the server reads it: string
 * fields and a `groups` array, empty values absent. The server rejects a
 * malformed claim; unverified here, anything else is skipped.
 */
function identityFromClaims(claims: Record<string, unknown>): Identity | null {
  const claim = claims['identity'];
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  const record = claim as Record<string, unknown>;
  const out: { -readonly [K in keyof Identity]: Identity[K] } = {};
  for (const key of IDENTITY_STRING_FIELDS) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  if (Array.isArray(record['groups'])) {
    const groups = (record['groups'] as unknown[]).filter(
      (g): g is string => typeof g === 'string' && g.length > 0,
    );
    if (groups.length > 0) out.groups = groups;
  }
  return Object.keys(out).length > 0 ? out : null;
}
