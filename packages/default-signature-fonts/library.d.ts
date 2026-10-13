/** One of the default handwriting fonts: its key, its family name, and the name a picker shows. */
export interface DefaultSignatureFont {
  readonly key: 'allura' | 'great-vibes' | 'caveat';
  readonly familyName: string;
  readonly label: string;
}

/** The three default handwriting fonts, in the order a picker shows them. */
export declare const DEFAULT_SIGNATURE_FONTS: readonly DefaultSignatureFont[];

/**
 * The TrueType bytes of the font `key`, loaded as a lazy module of your build. Register them on
 * the engine to draw a typed signature with the font.
 */
export declare function loadSignatureFont(key: DefaultSignatureFont['key']): Promise<Uint8Array>;
