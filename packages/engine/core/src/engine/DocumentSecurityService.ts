import type { DocCapability, PdfBits } from '../auth/scope';
import type { AbortablePromise } from '../promise/AbortablePromise';

export type DocumentOpenMode = 'none' | 'user' | 'owner';
export type DocumentEncryptionState = 'unknown' | 'none' | 'encrypted' | 'unsupported';
export type DocumentAccessReason = 'password' | 'cdn' | 'permissions-unknown';

/**
 * Boolean view of "what the PDF's permission bits allow," surfaced for
 * client UI badges ("this PDF disallows printing", "copy is blocked",
 * etc.). Names mirror the user-facing capability they correspond to,
 * not the raw bit names — so docs can render "Print: disabled" without
 * the reader needing to know PDF bit positions.
 *
 * Computed from {@link PdfBits} via the strict ISO 32000 rules:
 *   bit 12 only meaningful when bit 3 is also set
 *   form modification requires both bit 6 AND bit 4
 *   form fill is satisfied by bit 6 OR bit 9
 */
export interface PdfPermissionAdvisory {
  readonly canPrint: boolean;
  readonly canPrintHigh: boolean;
  readonly canCopy: boolean;
  readonly canAnnotate: boolean;
  readonly canFillForms: boolean;
  readonly canModifyForms: boolean;
  readonly canModifyPages: boolean;
  readonly canAssemble: boolean;
}

export interface PdfPermissionInfo {
  readonly known: boolean;
  readonly allAllowed: boolean | null;
  readonly bits: number | null;
  readonly openedAs: DocumentOpenMode | null;
  readonly securityHandlerRevision: number | null;
  /**
   * Typed boolean view of `bits`. Present whenever the caller had
   * access to the document's PDF bits at construction time (always
   * true in the /access response; not always populated by the cheaper
   * /head shape).
   */
  readonly flags?: PdfBits;
  /**
   * Capability-shaped "what does this PDF natively allow" view for UI
   * badges. Same population rule as `flags`.
   */
  readonly advisory?: PdfPermissionAdvisory;
}

export interface DocumentSecurityState {
  readonly encryption: {
    readonly state: DocumentEncryptionState;
    readonly requiresPassword: boolean | null;
  };
  readonly permissions: {
    readonly known: boolean;
    readonly bits: number | null;
    readonly allAllowed: boolean | null;
    readonly openedAs: DocumentOpenMode | null;
    readonly securityHandlerRevision: number | null;
    readonly canUpgradeToOwner: boolean;
  };
  readonly access: {
    readonly required: boolean;
    readonly reasons: DocumentAccessReason[];
    readonly endpoint?: string;
  };
}

/**
 * The CDN adapter identifier surfaced on the wire. Cloudflare users
 * deploy a custom Worker that verifies HMAC-SHA256 signatures and
 * configure the `custom-hmac` adapter — no first-class `'cloudflare'`
 * value is needed.
 */
export type CdnAdapter = 'none' | 'cloudfront' | 'cloud-cdn' | 'bunny' | 'azure-fd' | 'custom-hmac';

/**
 * Per-caller CDN access bits returned in the /access response. The
 * SDK fetch wrapper applies whatever channels are populated:
 *   - baseUrlOverrides   : swap the origin host/path-prefix for the CDN URL
 *   - authHeader         : attach a single header to every CDN request
 *   - signedQueryParams  : append params to every CDN URL (single-token signers)
 *   - signedCookies      : set cookies on the CDN origin before requests
 *   - signedPathPolicies : per-prefix params (one signature covers a path subtree)
 *
 * Each adapter populates only the channels it uses; the others stay
 * null. Frontend stays provider-agnostic — it doesn't branch on
 * `adapter`, it just applies whatever's present.
 */
export interface CdnAccessInfo {
  readonly adapter: CdnAdapter;
  readonly expiresAt: number;
  readonly cache: {
    readonly scope: 'browser-private' | 'edge-shared';
    readonly immutableVersionedReads: boolean;
  };
  readonly baseUrlOverrides: Partial<Record<string, string>> | null;
  readonly authHeader: { name: string; value: string } | null;
  readonly signedQueryParams: Record<string, string> | null;
  readonly signedCookies: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
    readonly domain?: string;
    readonly path?: string;
    readonly expires?: number;
  }> | null;
  readonly signedPathPolicies: ReadonlyArray<{
    readonly pathPrefix: string;
    readonly queryParams: Record<string, string>;
  }> | null;
}

export interface DocumentAccessInfo {
  readonly cdn: CdnAccessInfo;
  readonly passwordGrant: string | null;
  readonly pdfPermissions: PdfPermissionInfo | null;
  /**
   * Raw scope array exactly as the JWT carried it. Useful for debugging
   * and for clients that want to display the literal grants.
   */
  readonly scope: string[];
  /**
   * Concrete capability set granted to this caller, after expanding
   * `pdf.permissions` against the document's PDF bits and applying
   * the implication rules in the resolver (e.g. annotation collab
   * scopes imply `doc.annotate.read`). Client UI should drive feature
   * visibility off this, not off the raw `scope`.
   *
   * Sorted alphabetically for stable display.
   */
  readonly effectiveScope: string[];
  readonly identity: {
    readonly user_id?: string;
    readonly group_id?: string;
    readonly groups?: string[];
    readonly display_name?: string;
  };
  readonly originPasswordPolicy: {
    readonly mode: 'not-needed' | 'client-retry' | 'server-session';
  };
  readonly expiresAt: number;
}

export interface DocumentUnlockInput {
  readonly password: string;
  readonly mode?: 'any' | 'owner';
}

export interface DocumentUnlockResult {
  readonly security: DocumentSecurityState;
  readonly access?: DocumentAccessInfo;
}

/**
 * Identity of the caller for the current session. Cloud derives this
 * from the JWT claims (and refreshes from /access when called); local
 * derives it from the identity supplied to `engine.open()`. Null when
 * no identity is known (anonymous session).
 *
 * Re-exported alias of `IdentityClaims` from `auth/scope/types.ts` —
 * the alias gives a security-flavored name to the same shape so the
 * dev-facing API reads naturally.
 */
export type { IdentityClaims as DocumentIdentity } from '../auth/scope/types';

export interface DocumentSecurityService {
  /**
   * Raw structured security probe. Stable across engines, refreshed
   * after unlock/refresh. Power users and diagnostic tools read this;
   * most dev code uses the higher-level accessors below.
   */
  readonly current: DocumentSecurityState;

  /**
   * The caller's expanded capability set — raw scope + pdf bits +
   * implication rules, enumerated for DISPLAY ("here's what you can
   * do"). Identical shape on local and cloud; cloud uses the
   * server-canonical value when available, else computes locally from
   * JWT scope + /head bits.
   *
   * NOTE: this is an *enumeration*, not an authorization check. The `*`
   * admin wildcard and unbounded parametric collab grants are NOT
   * listed here (they can't be). To gate UI, use {@link allows} — the
   * same wildcard-aware predicate the engine enforces with.
   */
  readonly effectiveScope: ReadonlyArray<string>;

  /**
   * Wildcard-aware authorization check — the SAME predicate the engine
   * enforces with (`checkCapability`). A shown control gated on this
   * mirrors exactly what the engine will allow: the `*` admin grant and
   * `pdf.permissions`-derived bits are both honored. Use this for edit
   * gating (e.g. `allows('doc.pages.assemble')`); use `effectiveScope`
   * only to *display* the concrete grants.
   */
  allows(capability: DocCapability): boolean;

  /**
   * Identity of the current caller, or null when anonymous.
   */
  readonly identity: import('../auth/scope/types').IdentityClaims | null;

  /**
   * "Should I prompt the user for a password?" — the single source
   * of truth. Three states, each carrying exactly the data needed:
   *   - `none`     — do nothing
   *   - `required` — hard block; show modal; `hint` labels the prompt
   *   - `optional` — soft offer; show banner; only ever asks for owner
   * See {@link PasswordPrompt} for the full contract.
   */
  readonly passwordPrompt: import('./passwordPrompt').PasswordPrompt;

  unlock(input: DocumentUnlockInput): AbortablePromise<DocumentUnlockResult>;
}
