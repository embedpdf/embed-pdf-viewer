import type { DocumentSecurityProbeInfo } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { buildSecurityInfo, openedAsFromCode } from './internal/buildSecurityInfo';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { ensureInitialized } from '../../runtime/lifecycle/bootstrap';
import { normalizeU32 } from '../../shared/securityPermissions';

const FPDF_ERR_PASSWORD = 4;
const FPDF_ERR_SECURITY = 5;

/**
 * Reads document security/permission state. Three entry points:
 *
 *   - `probeFile` is the only doc-less path: it opens, inspects, and
 *     closes its own document straight off a file. It is the intentional
 *     exception to the package's `(runtime, session)` reader shape — it
 *     answers "what is this file's security?" before any session exists.
 *   - `readLiveSecurityInfo` / `checkPasswordPermissions` inspect an
 *     already-open `DocumentSession`.
 */
export class SecurityReader {
  constructor(private readonly runtime: PdfRuntimeModule) {
    // WorkerHost initializes the runtime before dispatching jobs, but
    // this reader is intentionally usable as a one-shot probe too.
    // `ensureInitialized()` is idempotent per runtime instance.
    ensureInitialized(this.runtime);
  }

  probeFile(path: string, password: string | null = null): DocumentSecurityProbeInfo {
    const now = Date.now();
    let access: ReturnType<PdfRuntimeModule['fileAccess']['fromNodeFile']> | null = null;
    let docPtr: Ptr | null = null;
    try {
      access = this.runtime.fileAccess.fromNodeFile(path);
      docPtr = this.runtime.fn.FPDF_LoadCustomDocument(access.ptr, password ?? '');
      if (!docPtr) {
        const err = this.runtime.fn.FPDF_GetLastError();
        if (err === FPDF_ERR_PASSWORD) {
          return {
            encryptionState: 'encrypted',
            encryptionRequiresPassword: true,
            securityHandlerRevision: null,
            pdfPermissionsBits: null,
            pdfPermissionsAllAllowed: null,
            pdfOpenedAs: null,
            securityProbedAt: now,
          };
        }
        if (err === FPDF_ERR_SECURITY) {
          return {
            encryptionState: 'unsupported',
            encryptionRequiresPassword: null,
            securityHandlerRevision: null,
            pdfPermissionsBits: null,
            pdfPermissionsAllAllowed: null,
            pdfOpenedAs: null,
            securityProbedAt: now,
          };
        }
        return unknownSecurity(now);
      }

      const encrypted = this.runtime.fn.EPDF_IsEncrypted(docPtr);
      // Cold probe (no password session): `FPDF_GetDocPermissions` reports
      // the document's declared permission word. Contrast with the live
      // session, which reads `FPDF_GetDocUserPermissions` (the effective
      // word after any owner unlock). See `readLiveSecurityInfo`.
      const bits = normalizeU32(this.runtime.fn.FPDF_GetDocPermissions(docPtr));
      const openedAs = !encrypted
        ? 'none'
        : this.runtime.fn.EPDF_IsOwnerUnlocked(docPtr)
          ? 'owner'
          : 'user';
      return buildSecurityInfo({
        openedAs,
        permissionsBits: bits,
        securityHandlerRevision: encrypted
          ? this.runtime.fn.FPDF_GetSecurityHandlerRevision(docPtr)
          : null,
        probedAt: now,
      });
    } finally {
      if (docPtr) this.runtime.fn.FPDF_CloseDocument(docPtr);
      access?.close();
    }
  }

  /**
   * Snapshot of the live session's EFFECTIVE security state.
   * `FPDF_GetDocUserPermissions` reports the permission word in force
   * right now (e.g. after an owner unlock), as opposed to the declared
   * word the cold `probeFile` path reads.
   */
  readLiveSecurityInfo(session: DocumentSession): DocumentSecurityProbeInfo {
    const { fn } = this.runtime;
    const docPtr = session.requireDocPtr();
    const encrypted = fn.EPDF_IsEncrypted(docPtr);
    const bits = normalizeU32(fn.FPDF_GetDocUserPermissions(docPtr));
    const openedAs = !encrypted ? 'none' : fn.EPDF_IsOwnerUnlocked(docPtr) ? 'owner' : 'user';
    return buildSecurityInfo({
      openedAs,
      permissionsBits: bits,
      securityHandlerRevision: encrypted ? fn.FPDF_GetSecurityHandlerRevision(docPtr) : null,
      probedAt: Date.now(),
    });
  }

  /**
   * Verify a password against the live session and report the resulting
   * effective permissions. Throws `DocPasswordIncorrect` when the
   * password is rejected, or (in `'owner'` mode) when it unlocks only as
   * a user.
   */
  checkPasswordPermissions(
    session: DocumentSession,
    password: string,
    mode: 'any' | 'owner' = 'any',
  ): DocumentSecurityProbeInfo {
    const docPtr = session.requireDocPtr();
    const { mem, fn } = this.runtime;
    const kindPtr = mem.alloc(4);
    const userPermissionsPtr = mem.alloc(4);
    const effectivePermissionsPtr = mem.alloc(4);
    const revisionPtr = mem.alloc(4);
    try {
      mem.poke(kindPtr, 'i32', 0);
      mem.poke(userPermissionsPtr, 'i32', 0);
      mem.poke(effectivePermissionsPtr, 'i32', 0);
      mem.poke(revisionPtr, 'i32', 0);
      const ok = fn.EPDF_CheckPasswordPermissions(
        docPtr,
        password,
        kindPtr,
        userPermissionsPtr,
        effectivePermissionsPtr,
        revisionPtr,
      );
      if (!ok) {
        throw new EngineError(EngineErrorCode.DocPasswordIncorrect, 'incorrect document password');
      }
      const openedAs = openedAsFromCode(Number(mem.peek(kindPtr, 'i32')));
      if (mode === 'owner' && openedAs !== 'owner') {
        throw new EngineError(EngineErrorCode.DocPasswordIncorrect, 'owner password required');
      }
      return buildSecurityInfo({
        openedAs,
        permissionsBits: normalizeU32(Number(mem.peek(effectivePermissionsPtr, 'i32'))),
        securityHandlerRevision: Number(mem.peek(revisionPtr, 'i32')),
        probedAt: Date.now(),
      });
    } finally {
      mem.free(revisionPtr);
      mem.free(effectivePermissionsPtr);
      mem.free(userPermissionsPtr);
      mem.free(kindPtr);
    }
  }
}

function unknownSecurity(now: number): DocumentSecurityProbeInfo {
  return {
    encryptionState: 'unknown',
    encryptionRequiresPassword: null,
    securityHandlerRevision: null,
    pdfPermissionsBits: null,
    pdfPermissionsAllAllowed: null,
    pdfOpenedAs: null,
    securityProbedAt: now,
  };
}
