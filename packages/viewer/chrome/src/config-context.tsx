/**
 * The resolved customization, as React context. The chrome schema and the
 * user's extra icons are RESOLVED ONCE in <FullViewer> and read here by the
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
  /** What placing a mark on a field does; default `sign` with a signer, else `visual`. */
  readonly mode?: SignatureMode;
  /** The key holder — `webCryptoSigner`, `remoteSigner`, `personalSigner`, or a thunk resolving one per signing. */
  readonly signer?: SignerPort | (() => Promise<SignerPort>);
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

export interface ResolvedViewerConfig {
  readonly chrome: ChromeSchema;
  /** User-registered icons — additive over the built-in set. */
  readonly icons: Readonly<Record<string, IconDef>>;
  readonly stamps: StampsCustomization;
  readonly signatures: SignaturesCustomization;
}

const DEFAULT_CONFIG: ResolvedViewerConfig = {
  chrome: defaultChrome,
  icons: {},
  stamps: {},
  signatures: {},
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
