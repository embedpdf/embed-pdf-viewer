import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type Engine,
  type OpenInput,
  type OpenOptions,
} from '@embedpdf/engine-core/runtime';
import { DEFAULT_LAYER_NAME, DocumentHeadSchema, wirePaths } from '@embedpdf/engine-core/wire';
import { generateUuid } from '@embedpdf/engine-services';
import { HttpClient, type HttpClientOptions } from './transport/HttpClient';
import { CloudDocumentHandle } from './document/CloudDocumentHandle';
import { CloudDocumentSecurityService } from './document/CloudDocumentSecurityService';
import { decodeUnverifiedClaims } from './transport/decodeUnverifiedClaims';

export interface CloudEngineOptions extends HttpClientOptions {}

/**
 * Cloud engine: speaks the same Engine interface as @embedpdf/engine
 * but routes everything through HTTPS to a remote @cloudpdf/server (or
 * CloudPDF SaaS). Identical observable contract; only the transport differs.
 */
export class CloudEngine implements Engine {
  static fromOptions(opts: CloudEngineOptions): CloudEngine {
    // One identity per engine instance: it stamps local events' origins AND
    // travels as X-Engine-Session-Id so the server can mark this instance's
    // audit rows — the SSE stream drops those echoes (exactly-once events).
    const sessionId = `cloud:${generateUuid()}`;
    return new CloudEngine(new HttpClient({ ...opts, sessionId }), sessionId);
  }

  private destroyed = false;

  private constructor(
    private readonly http: HttpClient,
    /** This engine instance's identity on every event's `origin.sessionId`. */
    private readonly sessionId: string,
  ) {}

  open(input: OpenInput, options?: OpenOptions): AbortablePromise<DocumentHandle> {
    if (this.destroyed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.RuntimeUnavailable, 'engine destroyed'),
      );
    }
    // Cloud reads scope + identity from the doc-scoped JWT — `options.scope`
    // and `options.identity` are engine-local concepts and are intentionally
    // ignored here. Same `OpenOptions` type for both engines is what makes
    // SDK code portable; the JWT is the authority cloud-side.
    void options?.scope;
    void options?.identity;

    // Presence-based precedence, same rule the local engine documents: an
    // options.password key wins (even explicitly null), else input.password.
    const effectivePassword =
      options && 'password' in options ? (options.password ?? null) : (input.password ?? null);

    if (input.kind === 'token') {
      // Open by doc-scoped JWT. We never verify the token SDK-side
      // (server is the verifier of record); we just decode the
      // unsigned payload to learn `doc_id`, then route to /head with
      // the per-open bearer. The resulting handle owns its own
      // scoped HttpClient — every subsequent RPC carries this
      // token, NOT the engine-level one, so one engine can hold
      // many handles each with a different bearer.
      const tokenSource = input.token;
      return AbortablePromise.run<DocumentHandle>(async (signal) => {
        const docHttp = this.http.withToken(tokenSource);
        const token = await docHttp.currentToken();
        const claims = decodeUnverifiedClaims(token);
        const docId = claims.doc_id;
        if (typeof docId !== 'string' || docId.length === 0) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            'cloud engine: token has no doc_id claim — mint a doc-scoped JWT',
          );
        }
        const layerName =
          typeof claims.layer_name === 'string' && claims.layer_name.length > 0
            ? claims.layer_name
            : DEFAULT_LAYER_NAME;
        const head = await docHttp.getJson(
          wirePaths.layerHead(docId, layerName),
          (raw) => DocumentHeadSchema.parse(raw),
          signal,
        );
        const handle = new CloudDocumentHandle(
          docHttp,
          head.id,
          layerName,
          head,
          token,
          this.sessionId,
        );
        await maybeAutoEstablishAccess(handle, head, signal, effectivePassword);
        return handle;
      });
    }

    if (input.kind === 'id') {
      // Open by docId using the engine-level token (typical: a
      // tenant JWT). The caller can override per-open by setting
      // `input.token`; the resulting handle then carries that
      // override for all of its RPCs.
      const id = input.id;
      const docHttp = input.token ? this.http.withToken(input.token) : this.http;
      return AbortablePromise.run<DocumentHandle>(async (signal) => {
        let layerName = input.layerName ?? DEFAULT_LAYER_NAME;
        // Resolve the bearer once so we have it for the layer-name
        // claim AND for the security service's local-fallback scope/
        // identity. May be null when the engine has no token at all
        // (caller invokes /head anonymously — server will reject).
        let resolvedToken: string | null = null;
        try {
          resolvedToken = await docHttp.currentToken();
        } catch {
          resolvedToken = null;
        }
        if (!input.layerName && resolvedToken) {
          const claims = decodeUnverifiedClaims(resolvedToken);
          if (typeof claims.layer_name === 'string' && claims.layer_name.length > 0) {
            layerName = claims.layer_name;
          }
        }
        const head = await docHttp.getJson(
          wirePaths.layerHead(id, layerName),
          (raw) => DocumentHeadSchema.parse(raw),
          signal,
        );
        const handle = new CloudDocumentHandle(
          docHttp,
          head.id,
          layerName,
          head,
          resolvedToken,
          this.sessionId,
        );
        await maybeAutoEstablishAccess(handle, head, signal, effectivePassword);
        return handle;
      });
    }

    void options;
    return AbortablePromise.rejectReason(
      new EngineError(
        EngineErrorCode.InvalidArg,
        `cloud engine supports OpenInput.kind === 'token' or 'id' (got '${(input as { kind?: string }).kind}')`,
      ),
    );
  }

  destroy(): AbortablePromise<void> {
    if (this.destroyed) return AbortablePromise.resolveValue<void>(undefined);
    this.destroyed = true;
    return AbortablePromise.resolveValue<void>(undefined);
  }
}

/**
 * Post-/head access establishment, in two layers:
 *
 * 1. **Supplied password** — a password given at open is always TRIED
 *    (PDFium parity: the local engine feeds it to the loader no matter
 *    what). Two triggers, because `/head` only carries the `password`
 *    reason when a password is needed to READ:
 *      - `reasons` has `'password'` → required-to-read case
 *      - `head.permissions.canUpgradeToOwner` → permission-only encrypted
 *        doc; the password can still upgrade to owner. Skipping this arm
 *        would silently drop supplied OWNER passwords — and diverge from
 *        the local engine on identical input.
 *    Outcomes follow "a password failure may only block what the password
 *    was needed for": a rejection in the required case leaves the handle
 *    locked (the caller's prompt takes over, showing "incorrect"); in the
 *    upgrade case the document stays readable and the failure is
 *    non-fatal. The one /access POST also installs the CDN binding, so a
 *    successful unlock covers the `password + cdn` combined case.
 *
 * 2. **CDN-only** — unchanged: `/access` without a password, transparently.
 *    A required password with NO supplied password never auto-calls; the
 *    dev prompts and `unlock()` runs the same POST.
 *
 * Non-password /access failures never break `open()` (the first real
 * request still tries origin, where the JWT check produces a regular
 * Forbidden) — but they are also never mistaken for a wrong password:
 * only a DocPasswordRequired/Incorrect rejection means "wrong password".
 */
async function maybeAutoEstablishAccess(
  handle: CloudDocumentHandle,
  head: {
    access: { required: boolean; reasons: ReadonlyArray<string> };
    permissions: { canUpgradeToOwner: boolean };
  },
  signal: AbortSignal,
  password: string | null,
): Promise<void> {
  const reasons = new Set(head.access.reasons);
  // CloudDocumentSecurityService exposes `establishAccess()` — the
  // no-password sibling of `unlock()`. The public DocumentSecurityService
  // interface doesn't carry it (unlock = user action), but every
  // CloudDocumentHandle's `.security` is a CloudDocumentSecurityService.
  const security = handle.security as CloudDocumentSecurityService;

  const tryPassword =
    password != null && (reasons.has('password') || head.permissions.canUpgradeToOwner);
  if (tryPassword) {
    const unlocked = await settleLinked(security.unlock({ password, mode: 'any' }), signal);
    if (unlocked) return; // /access succeeded — CDN binding installed too
    // Rejected or failed: in the required case the handle stays locked and
    // the caller's password prompt takes over (retrying re-POSTs /access);
    // in the upgrade case the document is readable regardless — fall
    // through so a CDN-only establishment still happens.
    if (reasons.has('password')) return;
  }

  if (!head.access.required) return;
  if (reasons.has('password')) return; // wait for explicit unlock()
  if (!reasons.has('cdn')) return; // nothing actionable for the SDK
  await settleLinked(security.establishAccess(), signal);
}

/** Await an /access attempt with open()-abort linkage. Returns whether it
 *  succeeded; failures are contained (see maybeAutoEstablishAccess). */
async function settleLinked(
  pending: ReturnType<CloudDocumentSecurityService['unlock']>,
  signal: AbortSignal,
): Promise<boolean> {
  const onAbort = () => pending.abort(signal.reason ?? new Error('aborted'));
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  try {
    await pending;
    return true;
  } catch {
    return false;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
