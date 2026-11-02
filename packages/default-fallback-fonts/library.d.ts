/** One of the default fallback fonts: its key, the face it is, and its file in `fonts/`. */
export interface DefaultFallbackFont {
  readonly key:
    | 'noto-sans-hebrew'
    | 'noto-sans-hebrew-bold'
    | 'noto-naskh-arabic'
    | 'noto-naskh-arabic-bold';
  readonly familyName: string;
  readonly weight: number;
  readonly italic: boolean;
  /** The TrueType file, exported as `@embedpdf/default-fallback-fonts/fonts/<file>`. */
  readonly file: string;
}

/** The default fallback fonts, in the order the engine adds them. */
export declare const DEFAULT_FALLBACK_FONTS: readonly DefaultFallbackFont[];

/** The TrueType bytes of the font `key`, loaded as a lazy module of your build. */
export declare function loadFallbackFont(key: DefaultFallbackFont['key']): Promise<Uint8Array>;
