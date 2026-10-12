/**
 * The resolved customization, as React context. The `layout` option and the
 * user's extra icons are resolved once in <FullViewer>; the layout at the
 * viewer's current size is resolved by <LayoutRoot> (layout-root.tsx), and read
 * here by the shell, menus and strips — no component imports the default
 * layout directly, so "the host changed the layout" is invisible below this
 * line.
 *
 * The default context values are the default config and the default layout:
 * components render correctly in tests and stories without a provider.
 */
import { createContext, useContext } from 'react';
import {
  EXPANDED_MIN_WIDTH_PX,
  barsAt,
  compileBar,
  menuOf,
  type LayoutData,
  type LayoutEnv,
  type LayoutOption,
  type MenuSection,
  type SelectionTarget,
} from '@embedpdf/core-ui';
import type { BarGroup, BarSchema } from '@embedpdf/react/toolbar';
import { DEFAULT_LAYOUT } from './config/chrome';
import type { IconDef } from './ui/icons';
import type { SignatureMode, SignerPort, TrustPort } from '@embedpdf/react/signature';
import type { StampAssetEngine } from '@embedpdf/react/stamp';

export interface StampsCustomization {
  /** `false`: no built-in library. A string: URL template with `{locale}`. */
  readonly defaultLibrary?: false | string;
  /** Library kinds the stamps sidebar lists. Default `['stamps']`. */
  readonly sidebar?: ReadonlyArray<string>;
  /** Quick marks in the Insert toolbar: asset ids (`library:name`) from any
   *  library, or one library's whole set. Default none. */
  readonly toolbar?: ReadonlyArray<string> | { readonly library: string };
  /** The local engine stamp libraries and signature marks open in, or a
   *  function that makes one on first use. Default: the viewer's own engine,
   *  which is right when it is local. A cloud viewer needs one of its own. */
  readonly assetEngine?: StampAssetEngine;
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

/**
 * A font beyond the standard 14, for the engine: what `engine.fonts` lists. The style panel
 * offers it for text boxes, once it's registered on the engine and mounted for the live editor.
 */
export interface ViewerFont {
  /** The id a free-text `fontFamily` carries, and the engine's key for it. Not one of the 14 standard names. */
  readonly key: string;
  /** Where the TTF or OTF file comes from (same-origin or CORS-enabled). */
  readonly url?: string;
  /** The file's bytes, in place of `url`. */
  readonly data?: Uint8Array | ArrayBuffer;
  /** The family's name, which the style panel shows (else the key); inferred from the file when left out. */
  readonly familyName?: string;
  readonly weight?: number;
  readonly italic?: boolean;
}

/** What `onPanelResize` hears: the panel, and the width the user gave it. */
export interface PanelResizeEvent {
  /** The panel's id. */
  readonly id: string;
  /** Its width now, in px. */
  readonly width: number;
}

export interface ResolvedViewerConfig {
  /** The `layout` option as given: the default without one. */
  readonly layout?: LayoutOption;
  /** User-registered icons — additive over the built-in set. */
  readonly icons: Readonly<Record<string, IconDef>>;
  readonly stamps: StampsCustomization;
  readonly signatures: SignaturesCustomization;
  /** The engine's fonts the style panel offers (see {@link ViewerFont}). */
  readonly fonts: readonly ViewerFont[];
  /** Hears each width the user gives a panel, by dragging its edge or with its keys. */
  readonly onPanelResize?: (event: PanelResizeEvent) => void;
}

const DEFAULT_CONFIG: ResolvedViewerConfig = {
  icons: {},
  stamps: {},
  signatures: {},
  fonts: [],
};

const ViewerConfigContext = createContext<ResolvedViewerConfig>(DEFAULT_CONFIG);

export const ViewerConfigProvider = ViewerConfigContext.Provider;

/** The `layout` option, for <LayoutRoot> to resolve at the viewer's size. */
export function useLayoutOption(): LayoutOption | undefined {
  return useContext(ViewerConfigContext).layout;
}

/** Tells the app a panel's new width: what the panel frame calls once the user has resized it. */
export function usePanelResize(): (event: PanelResizeEvent) => void {
  const { onPanelResize } = useContext(ViewerConfigContext);
  return (event) => onPanelResize?.(event);
}

// ── the layout at the viewer's current size ──────────────────────────────────

/** The layout as the viewer shows it now: at its env, with what shows nothing left out. */
export interface ResolvedLayout {
  /** The layout's data at this env. */
  readonly data: LayoutData;
  readonly env: LayoutEnv;
  /** A bar as its toolbar fits it, or `null` for a bar the layout doesn't have. */
  bar(id: string): BarSchema | null;
  /** The bars over a selection of this kind, as one bar, or `null` when there is none. */
  strip(target: SelectionTarget): BarSchema | null;
  /** A menu's sections, or `null` for a menu the layout doesn't have. */
  menu(id: string): readonly MenuSection[] | null;
}

/** The env before the viewer is measured, and without a <LayoutRoot>. */
export const DEFAULT_ENV: LayoutEnv = {
  size: 'expanded',
  width: EXPANDED_MIN_WIDTH_PX,
  touch: false,
  dir: 'ltr',
};

/**
 * The bars over a selection of this kind as one bar, read through `bar`: one bar as it is, or
 * several as one, their groups in bar order and named after their bar so the names stay unique.
 */
export function stripOf(
  data: LayoutData,
  target: SelectionTarget,
  bar: (id: string) => BarSchema | null,
): BarSchema | null {
  const bars = barsAt(data, target)
    .map(bar)
    .filter((each): each is BarSchema => each !== null);
  if (bars.length <= 1) return bars[0] ?? null;
  const sections: { -readonly [Name in 'start' | 'center' | 'end']?: readonly BarGroup[] } = {};
  for (const name of ['start', 'center', 'end'] as const) {
    const groups = bars.flatMap((each) =>
      (each.sections[name] ?? []).map((group) => ({ ...group, id: `${each.id}.${group.id}` })),
    );
    if (groups.length > 0) sections[name] = groups;
  }
  return { id: target, sections };
}

/** The layout as plain reads of its data: no bar leaves anything out. */
export function staticResolvedLayout(data: LayoutData, env: LayoutEnv): ResolvedLayout {
  const bar = (id: string) => compileBar(data, id);
  return {
    data,
    env,
    bar,
    strip: (target) => stripOf(data, target, bar),
    menu: (id) => menuOf(data, id),
  };
}

const ResolvedLayoutContext = createContext<ResolvedLayout>(
  staticResolvedLayout(DEFAULT_LAYOUT, DEFAULT_ENV),
);

export const ResolvedLayoutProvider = ResolvedLayoutContext.Provider;

export function useResolvedLayout(): ResolvedLayout {
  return useContext(ResolvedLayoutContext);
}

/** The viewer's env: its size, width, whether it's touched, and its direction. */
export function useLayoutEnv(): LayoutEnv {
  return useContext(ResolvedLayoutContext).env;
}

/** A menu's sections from the layout, or `null` for a menu it doesn't have. */
export function useMenu(id: string): readonly MenuSection[] | null {
  return useContext(ResolvedLayoutContext).menu(id);
}

/** The bars over a selection of this kind, as one bar; `undefined` when the layout has none. */
export function useStripSchema(target: SelectionTarget): BarSchema | undefined {
  return useContext(ResolvedLayoutContext).strip(target) ?? undefined;
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

export function useConfiguredFonts(): readonly ViewerFont[] {
  return useContext(ViewerConfigContext).fonts;
}
