import {
  EngineError,
  EngineErrorCode,
  type FontEmbeddingPermission,
  type FontIdentityInfo,
} from '@embedpdf/engine-core/runtime';
import type { PdfFileAccessHandle, PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { readUtf8String } from '../../runtime/memory/strings';

/** `EPDF_FONT_EMBEDDING_*` codes. Restricted (3) and bitmap-only (4) are
 *  refused at registration, so they never reach a handle. */
function permissionFromCode(code: number): FontEmbeddingPermission {
  switch (code) {
    case 1:
      return 'editable';
    case 2:
      return 'preview-and-print';
    default:
      return 'installable';
  }
}

/** The engine's family comparison: no case, spaces, hyphens, underscores. */
function familyKey(family: string): string {
  return family.toLowerCase().replace(/[\s\-_'"]/g, '');
}

/**
 * A font to register at thread startup from a local file. Used by hosts that
 * own their font policy (the cloud server's fallback fonts), as opposed to the
 * per-request `fonts.register` wire path the browser engine drives.
 *
 * Registration is by path, mirroring how the server opens base documents
 * (`fileAccess.fromNodeFile`): the bytes are range-read on demand and never
 * held resident in the JS heap, so a deployment can configure many large
 * fallback fonts (CJK families) without paying RAM per font.
 */
export interface StartupFontSpec {
  key: string;
  /** Absolute path to a TTF/OTF file (native/node runtimes only). */
  path: string;
  familyName?: string;
  weight?: number;
  /** `undefined` → infer from the file. */
  italic?: boolean;
  /** Also add to the glyph-fallback chain (automatic missing-glyph fill). */
  fallback?: boolean;
}

/**
 * Thread-confined runtime font registry binding.
 *
 * Wraps the `EPDFFont_*` C API on a single PDFium thread. PDFium's font
 * registry is thread-local: a font registered here is visible only to this
 * thread's page rendering and annotation-authoring calls, and the numeric
 * `CFX_FontRegistry::FontId` it returns is a per-thread `next_font_id++`.
 *
 * That id is volatile, so we never let it cross the worker boundary. The host
 * owns the `fontKey → id` map (passed in by reference) and every wire message
 * references the stable `fontKey`. The FreeText writer resolves a key to the
 * current thread's id through {@link idFor} at authoring time.
 *
 * Lives in `engine-services` (not a worker host) so the browser Web Worker,
 * the Node `worker_thread` server, and any future direct-thread embedding
 * share the exact same binding — only the `PdfRuntimeModule` (WASM vs native)
 * differs.
 */
export class FontRegistrar {
  /**
   * File-access handles retained for path-registered fonts. PDFium range-reads
   * the file lazily (on each face creation), so the FPDF_FILEACCESS must stay
   * alive until the registry is cleared — same lifetime rule as a file-backed
   * base document. Closed in {@link clear}.
   */
  private readonly fileHandles: PdfFileAccessHandle[] = [];
  /** What the runtime resolved for each key: the identity a document names
   *  the face by, and the licence. */
  private readonly identities = new Map<string, FontIdentityInfo>();

  constructor(
    private readonly runtime: PdfRuntimeModule,
    /** Host-owned `fontKey → native FontId` map for this thread. */
    private readonly ids: Map<string, number>,
  ) {}

  /**
   * Register a font from its bytes. Copies into the WASM heap, hands the
   * pointer to `EPDFFont_RegisterMemFont64` (which copies the bytes into the
   * native registry), then frees the scratch — so the heap holds exactly one
   * retained copy per registered font.
   *
   * Throws `InvalidArg` when the runtime rejects the font (corrupt, no glyphs).
   */
  register(
    fontKey: string,
    familyName: string,
    weight: number,
    italic: number,
    bytes: Uint8Array,
  ): void {
    if (bytes.byteLength === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, `empty font data: ${fontKey}`);
    }
    const { mem, fn } = this.runtime;
    const ptr = mem.alloc(bytes.byteLength);
    try {
      mem.writeBytes(ptr, bytes);
      const id = fn.EPDFFont_RegisterMemFont64(familyName, weight, italic, ptr, bytes.byteLength);
      if (id === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `font registration failed (unloadable or no glyphs): ${fontKey}`,
        );
      }
      this.ids.set(fontKey, id);
      this.identities.set(fontKey, this.readIdentity(id, { familyName, weight, italic }));
    } finally {
      mem.free(ptr);
    }
  }

  /**
   * Register a font from a local file via `EPDFFont_RegisterFont`. The runtime
   * range-reads the file on demand (it is not loaded into the JS heap), and the
   * file-access handle is retained until {@link clear}. Native/node only.
   *
   * Throws `InvalidArg` when the runtime rejects the font (corrupt, no glyphs).
   */
  registerFromNodeFile(
    fontKey: string,
    familyName: string,
    weight: number,
    italic: number,
    path: string,
  ): void {
    const access = this.runtime.fileAccess.fromNodeFile(path);
    let id = 0;
    try {
      id = this.runtime.fn.EPDFFont_RegisterFont(familyName, weight, italic, access.ptr);
    } catch (error) {
      access.close();
      throw error;
    }
    if (id === 0) {
      access.close();
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `font registration failed (unloadable or no glyphs): ${fontKey} (${path})`,
      );
    }
    this.ids.set(fontKey, id);
    this.identities.set(fontKey, this.readIdentity(id, { familyName, weight, italic }));
    this.fileHandles.push(access);
  }

  /** The identity and licence the runtime resolved for a key. Throws if unknown. */
  describe(fontKey: string): FontIdentityInfo {
    const identity = this.identities.get(fontKey);
    if (!identity) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `font not registered on this thread: ${fontKey}`,
      );
    }
    return identity;
  }

  /** {@link describe} for callers that treat an unknown key as "not a key". */
  describeOrUndefined(fontKey: string): FontIdentityInfo | undefined {
    return this.identities.get(fontKey);
  }

  /**
   * The key of the registered font whose identity matches a face (family
   * compared the engine's way; the closest weight, italic first), or
   * undefined when no registered family matches.
   */
  keyForFace(family: string, weight: number, italic: boolean): string | undefined {
    const wanted = familyKey(family);
    let best: { key: string; score: number } | undefined;
    for (const [key, identity] of this.identities) {
      if (familyKey(identity.familyName) !== wanted) continue;
      const score = Math.abs(identity.weight - weight) + (identity.italic === italic ? 0 : 1000);
      if (!best || score < best.score) best = { key, score };
    }
    return best?.key;
  }

  /** The application asserts a licence permitting editing with the font. */
  authorizeEditing(fontKey: string): FontIdentityInfo {
    const id = this.requireId(fontKey);
    if (!this.runtime.fn.EPDFFont_AuthorizeEditing(id)) {
      throw new EngineError(EngineErrorCode.InvalidArg, `authorizeEditing failed: ${fontKey}`);
    }
    const previous = this.describe(fontKey);
    const identity = this.readIdentity(id, {
      familyName: previous.familyName,
      weight: previous.weight,
      italic: previous.italic ? 1 : 0,
    });
    this.identities.set(fontKey, identity);
    return identity;
  }

  private readIdentity(
    id: number,
    given: { familyName: string; weight: number; italic: number },
  ): FontIdentityInfo {
    const { fn, mem } = this.runtime;
    // A runtime built before a getter existed reports what was given at
    // registration (its own inference stays unknown to the host). A missing
    // export surfaces as an absent binding or as a wrapper that throws when
    // called, so each read falls back on its own.
    const attempt = <T>(read: () => T, fallback: T): T => {
      try {
        return read();
      } catch {
        return fallback;
      }
    };
    return {
      familyName: attempt(
        () =>
          readUtf8String(mem, (buf, cap) => fn.EPDFFont_GetFamilyName(id, buf, cap)) ??
          given.familyName,
        given.familyName,
      ),
      weight: attempt(() => fn.EPDFFont_GetWeight(id), given.weight || 400),
      italic: attempt(() => fn.EPDFFont_IsItalic(id), given.italic === 1),
      embeddingPermission: attempt(
        () => permissionFromCode(fn.EPDFFont_GetEmbeddingPermission(id)),
        'installable' as const,
      ),
      editingAuthorized: attempt(() => fn.EPDFFont_IsEditingAuthorized(id), true),
      instanced: attempt(() => fn.EPDFFont_IsInstanced(id), false),
    };
  }

  /**
   * Register host-owned startup fonts on this thread, in order, optionally
   * adding each to the fallback chain. Order matters: it fixes both the native
   * FontIds and the fallback precedence, so every worker thread that runs the
   * same list ends up identical.
   */
  registerStartup(specs: readonly StartupFontSpec[]): void {
    for (const spec of specs) {
      const italic = spec.italic === undefined ? -1 : spec.italic ? 1 : 0;
      this.registerFromNodeFile(
        spec.key,
        spec.familyName ?? '',
        spec.weight ?? 0,
        italic,
        spec.path,
      );
      if (spec.fallback) {
        this.addFallback(spec.key);
      }
    }
  }

  /** Append a registered font to the ordered glyph-fallback chain. */
  addFallback(fontKey: string): void {
    const id = this.requireId(fontKey);
    if (!this.runtime.fn.EPDFFont_AddFallbackFont(id)) {
      throw new EngineError(EngineErrorCode.InvalidArg, `addFallback failed: ${fontKey}`);
    }
  }

  clearFallbacks(): void {
    this.runtime.fn.EPDFFont_ClearFallbackFonts();
  }

  /** Unregister every font and reset the fallback chain (clears the map too). */
  clear(): void {
    this.runtime.fn.EPDFFont_ClearRegisteredFonts();
    this.ids.clear();
    this.identities.clear();
    // Native registry no longer reads through these — release the file handles.
    for (const access of this.fileHandles) {
      access.close();
    }
    this.fileHandles.length = 0;
  }

  /** Resolve a stable key to this thread's native FontId. Throws if unknown. */
  idFor(fontKey: string): number {
    return this.requireId(fontKey);
  }

  private requireId(fontKey: string): number {
    const id = this.ids.get(fontKey);
    if (id === undefined) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `font not registered on this thread: ${fontKey}`,
      );
    }
    return id;
  }
}
