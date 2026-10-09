import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type Engine,
  type OpenInput,
  type OpenOptions,
} from '@embedpdf/engine-core/runtime';
import {
  DEFAULT_LAYER_NAME,
  DocumentHeadSchema,
  wirePaths,
  type DocumentHead,
} from '@embedpdf/engine-core/wire';
import { generateUuid } from '@embedpdf/engine-services';

import { CloudDocumentHandle } from './document/CloudDocumentHandle';
import { CloudDocumentSecurityService } from './document/CloudDocumentSecurityService';
import { engineErrorFromShareExchange, ShareExchangeError, shareSessionSource } from './share';
import { decodeUnverifiedClaims } from './transport/decodeUnverifiedClaims';
import { HttpClient, type HttpClientOptions } from './transport/HttpClient';

/**
 * `cloudEngine()`'s options: the HTTP client's, minus the session id, which
 * the engine mints for each document it opens.
 */
export interface CloudEngineOptions extends Omit<HttpClientOptions, 'sessionId'> {}

/**
 * Cloud engine: speaks the same Engine interface as @embedpdf/engine
 * but routes everything through HTTPS to a remote @cloudpdf/server (or
 * CloudPDF SaaS). Identical observable contract; only the transport differs.
 */
export class CloudEngine implements Engine {
  static fromOptions(opts: CloudEngineOptions): CloudEngine {
    return new CloudEngine(new HttpClient(opts));
  }

  private destroyed = false;
  /** The documents this engine opened and nobody closed yet. */
  private readonly handles = new Set<CloudDocumentHandle>();

  private constructor(private readonly http: HttpClient) {}

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

    // The PDF's own password is an open option for every input kind, as on
    // the local engine. A share's passphrase is `input.sharePassword`.
    const effectivePassword = options?.password ?? null;

    if (input.kind === 'share') {
      // Open by public share token: exchange `shr_…` for a short-lived
      // doc-scoped session JWT, then delegate to the 'token' arm — the
      // handle binds to a self-renewing source, so revoking or editing
      // the share retargets this open at the next renewal. The exchange
      // rides the engine's own transport config (baseUrl + fetch);
      // exchange failures surface as EngineErrors on open and on every
      // later renewal (RPCs, SSE reconnects), never as raw
      // ShareExchangeErrors.
      const raw = shareSessionSource(this.http.baseUrl, input.shareToken, {
        ...(input.sharePassword !== undefined ? { password: input.sharePassword } : {}),
        fetch: this.http.fetchImpl,
      });
      const token = async () => {
        try {
          return await raw();
        } catch (error) {
          throw error instanceof ShareExchangeError ? engineErrorFromShareExchange(error) : error;
        }
      };
      return this.open({ kind: 'token', token }, options);
    }

    if (input.kind === 'token') {
      // Open by doc-scoped JWT. We never verify the token SDK-side
      // (server is the verifier of record); we just decode the
      // unsigned payload to learn `doc_id`, then route to /head with
      // the per-open bearer. The resulting handle owns its own
      // scoped HttpClient — every subsequent RPC carries this
      // token, not the engine-level one, so one engine can hold
      // many handles each with a different bearer.
      const tokenSource = input.token;
      return AbortablePromise.run<DocumentHandle>(async (signal) => {
        const docHttp = this.http.forDocument({ sessionId: newSessionId(), token: tokenSource });
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
          () => this.handles.delete(handle),
        );
        this.handles.add(handle);
        try {
          await establishOnOpen(handle, head, signal, effectivePassword, false);
        } catch (error) {
          await handle.close();
          throw error;
        }
        return handle;
      });
    }

    if (input.kind === 'id') {
      // Open by docId using the engine-level token (typical: a
      // tenant JWT). The caller can override per-open by setting
      // `input.token`; the resulting handle then carries that
      // override for all of its RPCs.
      const id = input.id;
      const docHttp = this.http.forDocument({
        sessionId: newSessionId(),
        ...(input.token ? { token: input.token } : {}),
      });
      return AbortablePromise.run<DocumentHandle>(async (signal) => {
        let layerName = input.layerName ?? DEFAULT_LAYER_NAME;
        // Resolve the bearer once so we have it for the layer-name
        // claim and for the security service's local-fallback scope/
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
          () => this.handles.delete(handle),
        );
        this.handles.add(handle);
        // A token naming no document is a tenant's, which owns its documents.
        const tenant =
          resolvedToken !== null &&
          typeof decodeUnverifiedClaims(resolvedToken).doc_id !== 'string';
        try {
          await establishOnOpen(handle, head, signal, effectivePassword, tenant);
        } catch (error) {
          await handle.close();
          throw error;
        }
        return handle;
      });
    }

    void options;
    return AbortablePromise.rejectReason(
      new EngineError(
        EngineErrorCode.InvalidArg,
        `cloud engine supports OpenInput.kind === 'token', 'id', or 'share' (got '${(input as { kind?: string }).kind}')`,
      ),
    );
  }

  /**
   * Close every document this engine opened (their event streams stop), then
   * refuse new opens. As on the local engine, a handle is unusable after.
   */
  destroy(): AbortablePromise<void> {
    if (this.destroyed) return AbortablePromise.resolveValue<void>(undefined);
    this.destroyed = true;
    const open = [...this.handles];
    this.handles.clear();
    return AbortablePromise.run<void>(async () => {
      await Promise.all(open.map((handle) => handle.close()));
    });
  }
}

/**
 * A session id for a document being opened. Every open is its own session,
 * even a second open of the same document on this engine. The id stamps the
 * document's own events' origins and travels as `X-Engine-Session-Id`: the
 * server keeps the session's object numbers under it and marks its audit
 * rows with it, so the document's stream drops its own echoes and hears
 * every other open as remote.
 */
function newSessionId(): string {
  return `cloud:${generateUuid()}`;
}

/**
 * What `open()` learns before handing the document over: access when the
 * password or a CDN needs it (see {@link maybeAutoEstablishAccess}), then
 * what the document's signatures forbid (the manifest). A caller that may
 * create objects calls `/access` anyway, beside the manifest fetch, for its
 * editing session's first object numbers; on a document locked by a
 * password, `unlock()` brings them. A failed `/access` doesn't fail the
 * open: creates then go without numbers until the pool gets some.
 */
async function establishOnOpen(
  handle: CloudDocumentHandle,
  head: DocumentHead,
  signal: AbortSignal,
  password: string | null,
  tenant: boolean,
): Promise<void> {
  const accessed = await maybeAutoEstablishAccess(handle, head, signal, password);
  const security = handle.security as CloudDocumentSecurityService;
  const locked = !accessed && head.access.reasons.includes('password');
  await Promise.all([
    !accessed && !locked && (tenant || mayCreateObjects(security))
      ? settleLinked(security.establishAccess(), signal)
      : undefined,
    handle.learnProtection(signal),
  ]);
}

/**
 * Whether the caller may make new objects (annotations as itself, pages,
 * form fields): the server's own test for handing out object numbers, from
 * what the client knows before `/access`.
 */
function mayCreateObjects(security: CloudDocumentSecurityService): boolean {
  return (
    security.allowsAnnotation('create') ||
    security.allows('doc.pages.assemble') ||
    security.allows('doc.forms.modify')
  );
}

/**
 * Post-/head access establishment, in two layers:
 *
 * 1. **Supplied password** — a password given at open is always tried
 *    (PDFium parity: the local engine feeds it to the loader no matter
 *    what). Two triggers, because `/head` only carries the `password`
 *    reason when a password is needed to read:
 *      - `reasons` has `'password'` → required-to-read case
 *      - `head.permissions.canUpgradeToOwner` → permission-only encrypted
 *        doc; the password can still upgrade to owner. Skipping this arm
 *        would silently drop supplied owner passwords — and diverge from
 *        the local engine on identical input.
 *    Outcomes follow "a password failure may only block what the password
 *    was needed for": a rejection in the required case leaves the handle
 *    locked (the prompt says `incorrect`, as on the local engine); in the
 *    upgrade case the document stays readable and the failure is
 *    non-fatal. The one /access POST also installs the CDN binding, so a
 *    successful unlock covers the `password + cdn` combined case.
 *
 * 2. **CDN-only** — unchanged: `/access` without a password, transparently.
 *    A required password with no supplied password never auto-calls; the
 *    dev prompts and `unlock()` runs the same POST.
 *
 * Non-password /access failures never break `open()` (the first real
 * request still tries origin, where the JWT check produces a regular
 * Forbidden) — but they are also never mistaken for a wrong password:
 * only a DocPasswordRequired/Incorrect rejection means "wrong password".
 *
 * Returns whether `/access` answered.
 */
async function maybeAutoEstablishAccess(
  handle: CloudDocumentHandle,
  head: {
    access: { required: boolean; reasons: ReadonlyArray<string> };
    permissions: { canUpgradeToOwner: boolean };
  },
  signal: AbortSignal,
  password: string | null,
): Promise<boolean> {
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
    if (unlocked) return true; // /access succeeded — CDN binding installed too
    // Rejected or failed: in the required case the handle stays locked and
    // the caller's password prompt takes over (`incorrect` when the password
    // was wrong; retrying re-POSTs /access); in the upgrade case the
    // document is readable regardless — fall through so a CDN-only
    // establishment still happens.
    if (reasons.has('password')) return false;
  }

  if (!head.access.required) return false;
  if (reasons.has('password')) return false; // wait for explicit unlock()
  if (!reasons.has('cdn')) return false; // nothing actionable for the SDK
  return settleLinked(security.establishAccess(), signal);
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
