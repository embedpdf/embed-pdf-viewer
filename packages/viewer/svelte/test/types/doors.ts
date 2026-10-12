/**
 * What each door's `<PDFViewer>` takes, checked by `pnpm typecheck`: every line marked
 * `@ts-expect-error` must fail to compile, or the check fails with an unused directive.
 */
import type { ComponentProps } from 'svelte';
import type { PDFViewer as LocalViewer } from '@embedpdf/viewer-svelte';
import type { Engine, PDFViewer as CoreViewer } from '@embedpdf/viewer-svelte/core';

type LocalProps = ComponentProps<typeof LocalViewer>;
type CoreProps = ComponentProps<typeof CoreViewer>;

declare const engine: Engine;

export const local: LocalProps[] = [
  // No engine: the built-in one.
  { src: '/report.pdf' },
  // The built-in engine's options.
  { engine: { wasmUrl: '/embedpdf/embedpdf.wasm' } },
  { engine, class: 'viewer', style: 'height: 100vh', element: null },
  { onready: (viewer) => viewer.commands, ondocumentchange: () => {}, onpanelresize: () => {} },
  // @ts-expect-error The config's callbacks go by their Svelte names here.
  { onReady: () => {} },
  // @ts-expect-error Not a theme.
  { theme: 'sepia' },
];

export const core: CoreProps[] = [
  { engine },
  { engine: () => engine, documents: [] },
  // @ts-expect-error No built-in engine on this door: `engine` is required.
  { src: '/report.pdf' },
  // @ts-expect-error Only a real engine: there is no built-in one for options to configure.
  { engine: { wasmUrl: '/embedpdf/embedpdf.wasm' } },
];
