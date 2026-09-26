/**
 * The resolved customization, as React context. The chrome schema and the
 * user's extra icons are resolved once in <FullViewer> and read here by the
 * shell, menus, and strips — no component imports the default schema value
 * directly, so "the host replaced the chrome" is invisible below this line.
 *
 * The default context value is the default config: components render correctly
 * in tests and stories without a provider.
 */
import { createContext, useContext } from 'react';
import type { BarSchema, ChromeSchema, MenuSchema } from '@embedpdf/react/toolbar';
import { defaultChrome, getMenu, getModeBar, getStrip } from './config/chrome';
import type { IconDef } from './ui/icons';
import type { SignatureMode, SignerPort, TrustPort } from '@embedpdf/react/signature';

export interface StampsCustomization {
  /** `false`: no built-in library. A string: URL template with `{locale}`. */
  readonly defaultLibrary?: false | string;
  /** Library kinds the stamps sidebar lists. Default `['stamps']`. */
  readonly sidebar?: ReadonlyArray<string>;
  /** Quick marks in the Insert toolbar: asset ids (`library:name`) from any
   *  library, or one library's whole set. Default none. */
  readonly toolbar?: ReadonlyArray<string> | { readonly library: string };
}

export interface SignaturesCustomization {
  /** Which marks a person keeps. Default both. */
  readonly kinds?: ReadonlyArray<'signature' | 'initials'>;
  /** `'one'`: a single person per browser (no "new signature" once one exists). Default `'many'`. */
  readonly libraries?: 'one' | 'many';
  /** What placing a mark on a field does; default `sign` with a key, else `visual`. */
  readonly mode?: SignatureMode;
  /** The key — `webCryptoSigner`, `remoteSigner`, `personalSigner`, or a thunk resolving one per signing. */
  readonly key?: SignerPort | (() => Promise<SignerPort>);
  /** Trust anchors for validation; none → verdicts top out at "valid, signer unknown". */
  readonly trust?: TrustPort;
  /** Offer a certification (first signature, DocMDP) in the sign dialog. Default false. */
  readonly allowCertify?: boolean;
  /** Script faces for typed marks: registered on the viewer's engine on first use. */
  readonly fonts?: ReadonlyArray<{
    readonly key: string;
    readonly url: string;
    readonly label: string;
  }>;
}

/** A font for free-text annotations beyond the standard 14. */
export interface AnnotationFontSpec {
  /** The stable id a free-text `fontFamily` carries — the engine key and the
   *  CSS family the live editor renders with. Not one of the 14 standard names. */
  readonly key: string;
  /** Where the TTF/OTF bytes come from (same-origin or CORS-enabled). */
  readonly url: string;
  /** The picker's label. */
  readonly label: string;
  /** Family / style refinements for fallback matching; inferred from the file
   *  when omitted. */
  readonly familyName?: string;
  readonly weight?: number;
  readonly italic?: boolean;
}

export interface AnnotationsCustomization {
  /**
   * Fonts the free-text style panel offers beyond the standard 14. Each is
   * fetched once when the viewer mounts, registered on the viewer's engine
   * under its `key`, and mounted as a `@font-face` of the same name — so the
   * DOM editor shows the face the appearance stream will bake. A font whose
   * URL fails is skipped with a console warning. On the cloud engine (no
   * `engine.fonts`) they are not offered: fonts there are a server policy.
   */
  readonly fonts?: ReadonlyArray<AnnotationFontSpec>;
}

export interface ResolvedViewerConfig {
  readonly chrome: ChromeSchema;
  /** User-registered icons — additive over the built-in set. */
  readonly icons: Readonly<Record<string, IconDef>>;
  readonly stamps: StampsCustomization;
  readonly signatures: SignaturesCustomization;
  readonly annotations: AnnotationsCustomization;
}

const DEFAULT_CONFIG: ResolvedViewerConfig = {
  chrome: defaultChrome,
  icons: {},
  stamps: {},
  signatures: {},
  annotations: {},
};

const ViewerConfigContext = createContext<ResolvedViewerConfig>(DEFAULT_CONFIG);

export const ViewerConfigProvider = ViewerConfigContext.Provider;

export function useChromeSchema(): ChromeSchema {
  return useContext(ViewerConfigContext).chrome;
}

export function useMenuSchema(id: string): MenuSchema | undefined {
  return getMenu(useContext(ViewerConfigContext).chrome, id);
}

export function useModeBarSchema(id: string): BarSchema | undefined {
  return getModeBar(useContext(ViewerConfigContext).chrome, id);
}

export function useStripSchema(id: string): BarSchema | undefined {
  return getStrip(useContext(ViewerConfigContext).chrome, id);
}

export function useCustomIcons(): Readonly<Record<string, IconDef>> {
  return useContext(ViewerConfigContext).icons;
}

export function useStampsConfig(): StampsCustomization {
  return useContext(ViewerConfigContext).stamps;
}

export function useSignaturesConfig(): SignaturesCustomization {
  return useContext(ViewerConfigContext).signatures;
}

export function useAnnotationsConfig(): AnnotationsCustomization {
  return useContext(ViewerConfigContext).annotations;
}
