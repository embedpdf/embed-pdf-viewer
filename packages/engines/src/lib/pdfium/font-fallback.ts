import { Logger, NoopLogger } from '@embedpdf/models';
import type { WrappedPdfiumModule } from '@embedpdf/pdfium';

/**
 * Font charset constants from PDFium (fpdf_sysfontinfo.h)
 */
export const FontCharset = {
  ANSI: 0,
  DEFAULT: 1,
  SYMBOL: 2,
  SHIFTJIS: 128, // Japanese
  HANGEUL: 129, // Korean
  GB2312: 134, // Simplified Chinese
  CHINESEBIG5: 136, // Traditional Chinese
  GREEK: 161,
  VIETNAMESE: 163,
  HEBREW: 177,
  ARABIC: 178,
  CYRILLIC: 204, // Russian, etc.
  THAI: 222,
  EASTERNEUROPEAN: 238,
} as const;

export type FontCharsetValue = (typeof FontCharset)[keyof typeof FontCharset];

/**
 * A single font variant with weight and italic information
 */
export interface FontVariant {
  url: string;
  weight?: number; // 100-900, default 400
  italic?: boolean; // default false
}

/**
 * Font entry can be:
 * - A simple string URL (uses weight 400, non-italic)
 * - A single FontVariant
 * - An array of FontVariants for multiple weights/styles
 */
export type FontEntry = string | FontVariant | FontVariant[];

/**
 * Configuration for fallback fonts
 * Maps charset values to font URLs or font variant configurations
 */
export interface FontFallbackConfig {
  /**
   * Map of charset to font entry
   * Can be a simple URL string, a FontVariant, or an array of FontVariants
   */
  fonts: Partial<Record<FontCharsetValue, FontEntry>>;

  /**
   * Optional default font entry for unspecified charsets
   */
  defaultFont?: FontEntry;

  /**
   * Base URL to prepend to relative font URLs
   */
  baseUrl?: string;
}

interface FontHandle {
  id: number;
  charset: number;
  weight: number;
  italic: boolean;
  url: string;
  data: Uint8Array | null;
}

/**
 * FPDF_SYSFONTINFO struct layout (32-bit WASM pointers)
 *
 * struct FPDF_SYSFONTINFO {
 *   int version;                     // offset 0,  size 4
 *   void (*Release)(...);            // offset 4,  size 4
 *   void (*EnumFonts)(...);          // offset 8,  size 4
 *   void* (*MapFont)(...);           // offset 12, size 4
 *   void* (*GetFont)(...);           // offset 16, size 4
 *   unsigned long (*GetFontData)(...);// offset 20, size 4
 *   unsigned long (*GetFaceName)(...);// offset 24, size 4
 *   int (*GetFontCharset)(...);      // offset 28, size 4
 *   void (*DeleteFont)(...);         // offset 32, size 4
 * };
 * Total size: 36 bytes
 */
const SYSFONTINFO_SIZE = 36;
const OFFSET_VERSION = 0;
const OFFSET_RELEASE = 4;
const OFFSET_ENUMFONTS = 8;
const OFFSET_MAPFONT = 12;
const OFFSET_GETFONT = 16;
const OFFSET_GETFONTDATA = 20;
const OFFSET_GETFACENAME = 24;
const OFFSET_GETFONTCHARSET = 28;
const OFFSET_DELETEFONT = 32;

const LOG_SOURCE = 'pdfium';
const LOG_CATEGORY = 'font-fallback';

/**
 * Font fallback manager for PDFium - Pure TypeScript Implementation
 *
 * This class handles on-demand font loading when PDFium encounters
 * text that requires fonts not embedded in the PDF.
 *
 * The implementation creates the FPDF_SYSFONTINFO struct entirely
 * in JavaScript using Emscripten's addFunction API.
 */
export class FontFallbackManager {
  private readonly fontConfig: FontFallbackConfig;
  private readonly logger: Logger;
  private readonly fontHandles: Map<number, FontHandle> = new Map();
  private readonly fontCache: Map<string, Uint8Array> = new Map();
  private nextHandleId = 1;
  private module: WrappedPdfiumModule | null = null;
  private enabled = false;

  // Pointers for cleanup
  private structPtr: number = 0;
  private releaseFnPtr: number = 0;
  private enumFontsFnPtr: number = 0;
  private mapFontFnPtr: number = 0;
  private getFontFnPtr: number = 0;
  private getFontDataFnPtr: number = 0;
  private getFaceNameFnPtr: number = 0;
  private getFontCharsetFnPtr: number = 0;
  private deleteFontFnPtr: number = 0;

  constructor(config: FontFallbackConfig, logger: Logger = new NoopLogger()) {
    this.fontConfig = config;
    this.logger = logger;
  }

  /**
   * Initialize the font fallback system and attach to PDFium module
   */
  initialize(module: WrappedPdfiumModule): void {
    if (this.enabled) {
      this.logger.warn(LOG_SOURCE, LOG_CATEGORY, 'Font fallback already initialized');
      return;
    }

    this.module = module;
    const pdfium = module.pdfium;

    // Check if addFunction is available
    if (typeof pdfium.addFunction !== 'function') {
      this.logger.error(
        LOG_SOURCE,
        LOG_CATEGORY,
        'addFunction not available. Make sure WASM is compiled with -sALLOW_TABLE_GROWTH',
      );
      return;
    }

    try {
      // Allocate the FPDF_SYSFONTINFO struct
      this.structPtr = pdfium.wasmExports.malloc(SYSFONTINFO_SIZE);
      if (!this.structPtr) {
        throw new Error('Failed to allocate FPDF_SYSFONTINFO struct');
      }

      // Zero out the struct
      for (let i = 0; i < SYSFONTINFO_SIZE; i++) {
        pdfium.setValue(this.structPtr + i, 0, 'i8');
      }

      // Create function pointers for each callback
      // Signatures: 'v' = void, 'i' = int32, 'ii' = int32 int32, etc.
      // For pointers, use 'i' (they're 32-bit in WASM)

      // Release: void (*)(FPDF_SYSFONTINFO* pThis)
      this.releaseFnPtr = pdfium.addFunction((_pThis: number) => {
        // Nothing to do - we manage cleanup ourselves
      }, 'vi');

      // EnumFonts: void (*)(FPDF_SYSFONTINFO* pThis, void* pMapper)
      this.enumFontsFnPtr = pdfium.addFunction((_pThis: number, _pMapper: number) => {
        // We don't enumerate fonts - PDFium will call MapFont when needed
      }, 'vii');

      // MapFont: void* (*)(FPDF_SYSFONTINFO* pThis, int weight, FPDF_BOOL bItalic,
      //                    int charset, int pitch_family, const char* face, FPDF_BOOL* bExact)
      // Signature: return (i) + 7 params (iiiiiii) = 'iiiiiiii' (8 chars)
      this.mapFontFnPtr = pdfium.addFunction(
        (
          _pThis: number,
          weight: number,
          bItalic: number,
          charset: number,
          pitchFamily: number,
          facePtr: number,
          bExactPtr: number,
        ) => {
          const face = facePtr ? pdfium.UTF8ToString(facePtr) : '';
          const handle = this.mapFont(weight, bItalic, charset, pitchFamily, face);

          // Set bExact to 0 (false) - it's a fallback, not exact match
          if (bExactPtr) {
            pdfium.setValue(bExactPtr, 0, 'i32');
          }

          return handle;
        },
        'iiiiiiii',
      );

      // GetFont: void* (*)(FPDF_SYSFONTINFO* pThis, const char* face)
      this.getFontFnPtr = pdfium.addFunction((_pThis: number, facePtr: number) => {
        const face = facePtr ? pdfium.UTF8ToString(facePtr) : '';
        // Delegate to mapFont with default parameters
        return this.mapFont(400, 0, 0, 0, face);
      }, 'iii');

      // GetFontData: unsigned long (*)(FPDF_SYSFONTINFO* pThis, void* hFont,
      //                                unsigned int table, unsigned char* buffer, unsigned long buf_size)
      this.getFontDataFnPtr = pdfium.addFunction(
        (_pThis: number, hFont: number, table: number, buffer: number, bufSize: number) => {
          return this.getFontData(hFont, table, buffer, bufSize);
        },
        'iiiiii',
      );

      // GetFaceName: unsigned long (*)(FPDF_SYSFONTINFO* pThis, void* hFont, char* buffer, unsigned long buf_size)
      this.getFaceNameFnPtr = pdfium.addFunction(
        (_pThis: number, _hFont: number, _buffer: number, _bufSize: number) => {
          // We don't track face names
          return 0;
        },
        'iiiii',
      );

      // GetFontCharset: int (*)(FPDF_SYSFONTINFO* pThis, void* hFont)
      this.getFontCharsetFnPtr = pdfium.addFunction((_pThis: number, hFont: number) => {
        const handle = this.fontHandles.get(hFont);
        return handle?.charset ?? 0;
      }, 'iii');

      // DeleteFont: void (*)(FPDF_SYSFONTINFO* pThis, void* hFont)
      this.deleteFontFnPtr = pdfium.addFunction((_pThis: number, hFont: number) => {
        this.deleteFont(hFont);
      }, 'vii');

      // Fill in the struct
      pdfium.setValue(this.structPtr + OFFSET_VERSION, 1, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_RELEASE, this.releaseFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_ENUMFONTS, this.enumFontsFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_MAPFONT, this.mapFontFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_GETFONT, this.getFontFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_GETFONTDATA, this.getFontDataFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_GETFACENAME, this.getFaceNameFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_GETFONTCHARSET, this.getFontCharsetFnPtr, 'i32');
      pdfium.setValue(this.structPtr + OFFSET_DELETEFONT, this.deleteFontFnPtr, 'i32');

      // Register with PDFium
      module.FPDF_SetSystemFontInfo(this.structPtr);
      this.enabled = true;

      this.logger.info(
        LOG_SOURCE,
        LOG_CATEGORY,
        'Font fallback system initialized (pure TypeScript)',
        Object.keys(this.fontConfig.fonts),
      );
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Failed to initialize font fallback', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Disable the font fallback system and clean up resources
   */
  disable(): void {
    if (!this.enabled || !this.module) {
      return;
    }

    // Unregister from PDFium
    this.module.FPDF_SetSystemFontInfo(0);
    this.cleanup();
    this.enabled = false;

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Font fallback system disabled');
  }

  /**
   * Clean up allocated resources
   */
  private cleanup(): void {
    if (!this.module) return;

    const pdfium = this.module.pdfium;

    // Free the struct
    if (this.structPtr) {
      pdfium.wasmExports.free(this.structPtr);
      this.structPtr = 0;
    }

    // Remove function pointers
    const removeIfExists = (ptr: number) => {
      if (ptr && typeof pdfium.removeFunction === 'function') {
        try {
          pdfium.removeFunction(ptr);
        } catch {
          // Ignore errors - function might already be removed
        }
      }
    };

    removeIfExists(this.releaseFnPtr);
    removeIfExists(this.enumFontsFnPtr);
    removeIfExists(this.mapFontFnPtr);
    removeIfExists(this.getFontFnPtr);
    removeIfExists(this.getFontDataFnPtr);
    removeIfExists(this.getFaceNameFnPtr);
    removeIfExists(this.getFontCharsetFnPtr);
    removeIfExists(this.deleteFontFnPtr);

    this.releaseFnPtr = 0;
    this.enumFontsFnPtr = 0;
    this.mapFontFnPtr = 0;
    this.getFontFnPtr = 0;
    this.getFontDataFnPtr = 0;
    this.getFaceNameFnPtr = 0;
    this.getFontCharsetFnPtr = 0;
    this.deleteFontFnPtr = 0;
  }

  /**
   * Check if font fallback is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get statistics about font loading
   */
  getStats(): {
    handleCount: number;
    cacheSize: number;
    cachedUrls: string[];
  } {
    return {
      handleCount: this.fontHandles.size,
      cacheSize: this.fontCache.size,
      cachedUrls: Array.from(this.fontCache.keys()),
    };
  }

  /**
   * Pre-load fonts for specific charsets (optional optimization)
   * This can be called to warm the cache before rendering
   */
  async preloadFonts(charsets: FontCharsetValue[]): Promise<void> {
    const urls = charsets
      .map((charset) => this.getFontUrlForCharset(charset))
      .filter((url): url is string => url !== null);

    const uniqueUrls = [...new Set(urls)];

    await Promise.all(
      uniqueUrls.map(async (url) => {
        if (!this.fontCache.has(url)) {
          try {
            const data = await this.fetchFontAsync(url);
            if (data) {
              this.fontCache.set(url, data);
              this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Pre-loaded font: ${url}`);
            }
          } catch (error) {
            this.logger.warn(LOG_SOURCE, LOG_CATEGORY, `Failed to pre-load font: ${url}`, error);
          }
        }
      }),
    );
  }

  // ============================================================================
  // PDFium Callback Implementations
  // ============================================================================

  /**
   * MapFont - called by PDFium when it needs a font
   */
  private mapFont(
    weight: number,
    bItalic: number,
    charset: number,
    pitchFamily: number,
    face: string,
  ): number {
    const italic = bItalic !== 0;

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'MapFont called', {
      weight,
      italic,
      charset,
      pitchFamily,
      face,
    });

    const result = this.findBestFontMatch(charset, weight, italic);
    if (!result) {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `No font configured for charset ${charset}`);
      return 0;
    }

    // Create a new handle
    const handle: FontHandle = {
      id: this.nextHandleId++,
      charset,
      weight,
      italic,
      url: result.url,
      data: null,
    };

    this.fontHandles.set(handle.id, handle);

    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      `Created font handle ${handle.id} for ${result.url} (requested: weight=${weight}, italic=${italic}, matched: weight=${result.matchedWeight}, italic=${result.matchedItalic})`,
    );

    return handle.id;
  }

  /**
   * GetFontData - called by PDFium to get font bytes
   */
  private getFontData(
    fontHandle: number,
    table: number,
    bufferPtr: number,
    bufSize: number,
  ): number {
    const handle = this.fontHandles.get(fontHandle);
    if (!handle) {
      this.logger.warn(LOG_SOURCE, LOG_CATEGORY, `Unknown font handle: ${fontHandle}`);
      return 0;
    }

    // Load font data if not already loaded
    if (!handle.data) {
      // Check cache first
      if (this.fontCache.has(handle.url)) {
        handle.data = this.fontCache.get(handle.url)!;
      } else {
        // Synchronous fetch - this is the key part
        // It's okay because we're in a Web Worker
        handle.data = this.fetchFontSync(handle.url);
        if (handle.data) {
          this.fontCache.set(handle.url, handle.data);
        }
      }
    }

    if (!handle.data) {
      this.logger.warn(LOG_SOURCE, LOG_CATEGORY, `Failed to load font: ${handle.url}`);
      return 0;
    }

    const fontData = handle.data;

    // If table != 0, PDFium wants a specific TrueType table
    // For simplicity, we return 0 and let PDFium request the whole file
    if (table !== 0) {
      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        `Table ${table} requested - returning 0 to request whole file`,
      );
      return 0;
    }

    // If buffer is null or too small, just return the size needed
    if (bufferPtr === 0 || bufSize < fontData.length) {
      return fontData.length;
    }

    // Copy font data to WASM memory
    if (this.module) {
      const heap = this.module.pdfium.HEAPU8;
      heap.set(fontData, bufferPtr);

      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        `Copied ${fontData.length} bytes to buffer for handle ${fontHandle}`,
      );
    }

    return fontData.length;
  }

  /**
   * DeleteFont - called by PDFium when done with a font
   */
  private deleteFont(fontHandle: number): void {
    const handle = this.fontHandles.get(fontHandle);
    if (handle) {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Deleting font handle ${fontHandle}`);
      // Don't delete from cache - font data can be reused
      this.fontHandles.delete(fontHandle);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Find the best matching font variant for the given parameters
   */
  private findBestFontMatch(
    charset: number,
    requestedWeight: number,
    requestedItalic: boolean,
  ): { url: string; matchedWeight: number; matchedItalic: boolean } | null {
    const { fonts, defaultFont, baseUrl } = this.fontConfig;

    const entry = fonts[charset as FontCharsetValue] ?? defaultFont;
    if (!entry) {
      return null;
    }

    // Normalize to array of variants
    const variants = this.normalizeToVariants(entry);
    if (variants.length === 0) {
      return null;
    }

    // Find best match
    const best = this.selectBestVariant(variants, requestedWeight, requestedItalic);

    // Apply base URL
    let url = best.url;
    if (
      baseUrl &&
      !url.startsWith('http://') &&
      !url.startsWith('https://') &&
      !url.startsWith('/')
    ) {
      url = `${baseUrl}/${url}`;
    }

    return {
      url,
      matchedWeight: best.weight ?? 400,
      matchedItalic: best.italic ?? false,
    };
  }

  /**
   * Normalize a FontEntry to an array of FontVariants
   */
  private normalizeToVariants(entry: FontEntry): FontVariant[] {
    if (typeof entry === 'string') {
      return [{ url: entry, weight: 400, italic: false }];
    }
    if (Array.isArray(entry)) {
      return entry.map((v) => ({
        url: v.url,
        weight: v.weight ?? 400,
        italic: v.italic ?? false,
      }));
    }
    return [{ url: entry.url, weight: entry.weight ?? 400, italic: entry.italic ?? false }];
  }

  /**
   * Select the best matching variant based on weight and italic
   * Uses CSS font matching algorithm principles:
   * 1. Exact italic match preferred
   * 2. Closest weight (with bias toward bolder for weights >= 400)
   */
  private selectBestVariant(
    variants: FontVariant[],
    requestedWeight: number,
    requestedItalic: boolean,
  ): FontVariant {
    if (variants.length === 1) {
      return variants[0];
    }

    // First, try to find variants matching the italic requirement
    const italicMatches = variants.filter((v) => (v.italic ?? false) === requestedItalic);
    const candidates = italicMatches.length > 0 ? italicMatches : variants;

    // Find closest weight match
    let bestMatch = candidates[0];
    let bestDistance = Math.abs((bestMatch.weight ?? 400) - requestedWeight);

    for (const variant of candidates) {
      const variantWeight = variant.weight ?? 400;
      const distance = Math.abs(variantWeight - requestedWeight);

      if (distance < bestDistance) {
        bestMatch = variant;
        bestDistance = distance;
      } else if (distance === bestDistance) {
        // Tie-breaker: prefer bolder for requested weight >= 500, lighter for < 500
        const currentWeight = bestMatch.weight ?? 400;
        if (requestedWeight >= 500) {
          // Prefer bolder
          if (variantWeight > currentWeight) {
            bestMatch = variant;
          }
        } else {
          // Prefer lighter
          if (variantWeight < currentWeight) {
            bestMatch = variant;
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Get font URL for a charset (backward compatible helper)
   */
  private getFontUrlForCharset(charset: number): string | null {
    const result = this.findBestFontMatch(charset, 400, false);
    return result?.url ?? null;
  }

  /**
   * Fetch font data synchronously using XMLHttpRequest
   * This is necessary because PDFium's callbacks are synchronous
   */
  private fetchFontSync(url: string): Uint8Array | null {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Fetching font synchronously: ${url}`);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false); // false = synchronous
      xhr.responseType = 'arraybuffer';
      xhr.send();

      if (xhr.status === 200) {
        const data = new Uint8Array(xhr.response as ArrayBuffer);
        this.logger.info(LOG_SOURCE, LOG_CATEGORY, `Loaded font: ${url} (${data.length} bytes)`);
        return data;
      } else {
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `Failed to load font: ${url} (HTTP ${xhr.status})`,
        );
        return null;
      }
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, `Error fetching font: ${url}`, error);
      return null;
    }
  }

  /**
   * Fetch font data asynchronously (for preloading)
   */
  private async fetchFontAsync(url: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Default font configuration using Google Noto fonts (simple version)
 *
 * You'll need to host these fonts on your server or use a CDN.
 * Download from: https://fonts.google.com/noto
 */
export const defaultNotoFontConfig: FontFallbackConfig = {
  fonts: {
    [FontCharset.SHIFTJIS]: 'NotoSansJP-Regular.otf',
    [FontCharset.HANGEUL]: 'NotoSansKR-Regular.otf',
    [FontCharset.GB2312]: 'NotoSansHans-Regular.otf',
    [FontCharset.CHINESEBIG5]: 'NotoSansHant-Regular.otf',
    [FontCharset.ARABIC]: 'NotoNaskhArabic-Regular.ttf',
    [FontCharset.HEBREW]: 'NotoSansHebrew-Regular.ttf',
    [FontCharset.THAI]: 'NotoSansThai-Regular.ttf',
    [FontCharset.CYRILLIC]: 'NotoSans-Regular.ttf',
    [FontCharset.GREEK]: 'NotoSans-Regular.ttf',
    [FontCharset.VIETNAMESE]: 'NotoSans-Regular.ttf',
  },
  baseUrl: '/fonts',
};

/**
 * Advanced font configuration with weight variants
 *
 * Example showing how to configure multiple weights for better rendering.
 * CJK fonts typically don't have italic variants - PDFium will synthesize.
 */
export const advancedNotoFontConfig: FontFallbackConfig = {
  fonts: {
    // Japanese with weight variants
    [FontCharset.SHIFTJIS]: [
      { url: 'NotoSansJP-Thin.otf', weight: 100 },
      { url: 'NotoSansJP-Light.otf', weight: 300 },
      { url: 'NotoSansJP-DemiLight.otf', weight: 350 },
      { url: 'NotoSansJP-Regular.otf', weight: 400 },
      { url: 'NotoSansJP-Medium.otf', weight: 500 },
      { url: 'NotoSansJP-Bold.otf', weight: 700 },
      { url: 'NotoSansJP-Black.otf', weight: 900 },
    ],
    // Korean with weight variants
    [FontCharset.HANGEUL]: [
      { url: 'NotoSansKR-Thin.otf', weight: 100 },
      { url: 'NotoSansKR-Light.otf', weight: 300 },
      { url: 'NotoSansKR-DemiLight.otf', weight: 350 },
      { url: 'NotoSansKR-Regular.otf', weight: 400 },
      { url: 'NotoSansKR-Medium.otf', weight: 500 },
      { url: 'NotoSansKR-Bold.otf', weight: 700 },
      { url: 'NotoSansKR-Black.otf', weight: 900 },
    ],
    // Simplified Chinese with weight variants
    [FontCharset.GB2312]: [
      { url: 'NotoSansHans-Thin.otf', weight: 100 },
      { url: 'NotoSansHans-Light.otf', weight: 300 },
      { url: 'NotoSansHans-DemiLight.otf', weight: 350 },
      { url: 'NotoSansHans-Regular.otf', weight: 400 },
      { url: 'NotoSansHans-Medium.otf', weight: 500 },
      { url: 'NotoSansHans-Bold.otf', weight: 700 },
      { url: 'NotoSansHans-Black.otf', weight: 900 },
    ],
    // Traditional Chinese with weight variants
    [FontCharset.CHINESEBIG5]: [
      { url: 'NotoSansHant-Thin.otf', weight: 100 },
      { url: 'NotoSansHant-Light.otf', weight: 300 },
      { url: 'NotoSansHant-DemiLight.otf', weight: 350 },
      { url: 'NotoSansHant-Regular.otf', weight: 400 },
      { url: 'NotoSansHant-Medium.otf', weight: 500 },
      { url: 'NotoSansHant-Bold.otf', weight: 700 },
      { url: 'NotoSansHant-Black.otf', weight: 900 },
    ],
    // Arabic
    [FontCharset.ARABIC]: [
      { url: 'NotoNaskhArabic-Regular.ttf', weight: 400 },
      { url: 'NotoNaskhArabic-Bold.ttf', weight: 700 },
    ],
    // Hebrew
    [FontCharset.HEBREW]: [
      { url: 'NotoSansHebrew-Regular.ttf', weight: 400 },
      { url: 'NotoSansHebrew-Bold.ttf', weight: 700 },
    ],
    // Latin-based with weight and italic variants (for Cyrillic, Greek, Vietnamese)
    [FontCharset.CYRILLIC]: [
      { url: 'NotoSans-Thin.ttf', weight: 100 },
      { url: 'NotoSans-ThinItalic.ttf', weight: 100, italic: true },
      { url: 'NotoSans-ExtraLight.ttf', weight: 200 },
      { url: 'NotoSans-ExtraLightItalic.ttf', weight: 200, italic: true },
      { url: 'NotoSans-Light.ttf', weight: 300 },
      { url: 'NotoSans-LightItalic.ttf', weight: 300, italic: true },
      { url: 'NotoSans-Regular.ttf', weight: 400 },
      { url: 'NotoSans-Italic.ttf', weight: 400, italic: true },
      { url: 'NotoSans-Medium.ttf', weight: 500 },
      { url: 'NotoSans-MediumItalic.ttf', weight: 500, italic: true },
      { url: 'NotoSans-SemiBold.ttf', weight: 600 },
      { url: 'NotoSans-SemiBoldItalic.ttf', weight: 600, italic: true },
      { url: 'NotoSans-Bold.ttf', weight: 700 },
      { url: 'NotoSans-BoldItalic.ttf', weight: 700, italic: true },
      { url: 'NotoSans-ExtraBold.ttf', weight: 800 },
      { url: 'NotoSans-ExtraBoldItalic.ttf', weight: 800, italic: true },
      { url: 'NotoSans-Black.ttf', weight: 900 },
      { url: 'NotoSans-BlackItalic.ttf', weight: 900, italic: true },
    ],
    [FontCharset.GREEK]: [
      { url: 'NotoSans-Regular.ttf', weight: 400 },
      { url: 'NotoSans-Italic.ttf', weight: 400, italic: true },
      { url: 'NotoSans-Bold.ttf', weight: 700 },
      { url: 'NotoSans-BoldItalic.ttf', weight: 700, italic: true },
    ],
    [FontCharset.VIETNAMESE]: [
      { url: 'NotoSans-Regular.ttf', weight: 400 },
      { url: 'NotoSans-Italic.ttf', weight: 400, italic: true },
      { url: 'NotoSans-Bold.ttf', weight: 700 },
      { url: 'NotoSans-BoldItalic.ttf', weight: 700, italic: true },
    ],
  },
  baseUrl: '/fonts',
};
