/**
 * @cloudpdf/viewer-angular — the full viewer as an Angular component, wired to CloudPDF.
 *
 * ```ts
 * @Component({
 *   imports: [CloudPdfViewer],
 *   template: `
 *     <cloudpdf-viewer baseUrl="https://api.cloudpdf.com" [src]="{ token }" style="height: 100vh" />
 *   `,
 * })
 * ```
 *
 * A cloud door, and nothing more. It is the open-source `<epdf-pdf-viewer>` of
 * `@embedpdf/viewer-angular/core` (the engine-agnostic door, where the engine is given) under a
 * cloud name, and supplies that engine from the cloud options through `resolveCloudConfig`.
 * Because the core door registers no default engine, the local PDFium engine is not part of
 * startup: the only import of it is the lazy one the stamp libraries make the first time someone
 * opens Stamps or Signatures.
 *
 * Everything the open viewer takes (`layout`, `commands`, `icons`, `strings`, `theme`, `plugins`,
 * your templates, `(ready)`, `EpdfPdfViewerRef`) works here unchanged (see
 * `@embedpdf/viewer-angular`). This file adds the CloudPDF connection and names the documents in
 * the cloud's words (`src` as `{ token }`, `{ id }` or `{ shareToken }`), and leaves out `scope`
 * and `identity`, which the document's token carries.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  type InputSignal,
  type Signal,
} from '@angular/core';
import { resolveCloudConfig, type ViewerConfig } from '@cloudpdf/viewer/config';
import {
  definedOf,
  EpdfPdfViewerBase,
  EpdfPdfViewerRef,
  EpdfViewerSlots,
  type ElementConfig,
} from '@embedpdf/viewer-angular/core';

// The open viewer's whole vocabulary rides along, so a cloud app imports one package.
export * from '@embedpdf/viewer-angular/core';
export { resolveCloudConfig } from '@cloudpdf/viewer/config';
// The cloud's `ViewerConfig` and its documents, in place of the ones `export *` brings: one name
// per door.
export type {
  CloudSource,
  DocumentEntry,
  DocumentSrc,
  ViewerConfig,
} from '@cloudpdf/viewer/config';

/** The input of the cloud config's key `Key`. */
type CloudInput<Key extends keyof ViewerConfig> = InputSignal<ViewerConfig[Key] | undefined>;

/**
 * `<cloudpdf-viewer>`: the full viewer, its pages rendered by a CloudPDF server. `baseUrl` is
 * the server, and `src` the document (or `documents`, for several); every other key of the open
 * viewer's config is an input as on `<epdf-pdf-viewer>`, or give them with `[config]`. The
 * connection and `documents` are read once, when the viewer starts; `src` follows its input.
 */
@Component({
  selector: 'cloudpdf-viewer',
  imports: [EpdfViewerSlots],
  providers: [{ provide: EpdfPdfViewerRef, useExisting: forwardRef(() => CloudPdfViewer) }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: '<embedpdf-viewer [owner]="this" />',
})
export class CloudPdfViewer extends EpdfPdfViewerBase {
  /** The config's other keys at once; each input given wins over its key here. */
  readonly config: InputSignal<Partial<ViewerConfig> | undefined> = input<Partial<ViewerConfig>>();
  /** The CloudPDF server: `https://api.cloudpdf.com`, or your own deployment. */
  readonly baseUrl: InputSignal<string> = input.required<string>();
  /** The engine's own token, when it has one: a string, or a function that gives a fresh one. */
  readonly token: CloudInput<'token'> = input<ViewerConfig['token']>();
  /** A `fetch` of your own, for every request the engine makes. */
  readonly fetch: CloudInput<'fetch'> = input<ViewerConfig['fetch']>();
  /**
   * One document: `{ token }` (a document token), `{ id }` (the engine's `token` must allow it)
   * or `{ shareToken }` (a share link from the dashboard). Another one opens in its place;
   * `null` closes it.
   */
  readonly src: CloudInput<'src'> = input<ViewerConfig['src']>();
  /** Several documents, with their names and passwords; with these, `src` is ignored. Read once. */
  readonly documents: CloudInput<'documents'> = input<ViewerConfig['documents']>();

  /** The engine, documents and plugins, made from the cloud options when the viewer starts. */
  private atStart: ReturnType<typeof resolveCloudConfig<ViewerConfig>> | null = null;

  protected readonly elementConfig: Signal<ElementConfig> = computed(() => {
    const resolved = resolveCloudConfig<ViewerConfig>({
      ...this.config(),
      ...definedOf({
        token: this.token(),
        fetch: this.fetch(),
        src: this.src(),
        documents: this.documents(),
      }),
      ...this.sharedConfig(),
      baseUrl: this.baseUrl(),
    });
    // Read once, like every key that isn't live: the engine, documents and plugins stay the ones
    // the viewer started with, while the live keys pass through.
    this.atStart ??= resolved;
    const { engine, documents, plugins } = this.atStart;
    return { ...resolved, engine, documents, plugins };
  });
}
