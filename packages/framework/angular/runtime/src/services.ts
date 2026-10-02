/**
 * The viewer's own services, which `provideEmbedPdf()` always has:
 *
 *   inject(EpdfViewer)     the viewer's settings (`identity`, `scope`, `accent`, `page`) and status
 *   inject(EpdfDocuments)  open, close, unlock and download documents; every tab, as signals
 *   inject(EpdfDocument)   the document this part of the template talks to, as signals
 */
import { Injectable, type Signal } from '@angular/core';
import { DocumentsToken, documentState, documentsState } from '@embedpdf/core';
import type { DeepPartial, PageInfo, SettingsChangedEvent, ViewerSettings } from '@embedpdf/core';
import type { Observable } from 'rxjs';
import { injectKernelHost } from './capability';
import type { EpdfViewerStatus } from './config';
// The services below extend a `PluginServiceClass`. Importing the type lets their built
// declarations name it from this file; without it they import this entry point by its own
// package name (`@embedpdf/angular/runtime`), which resolves only where the package can refer
// to itself.
import { pluginService, type PluginServiceClass } from './service';

/**
 * The viewer itself: its settings, and whether it started. The config given to
 * `provideEmbedPdf()` is read once; what may change while the app runs changes here:
 *
 *   effect(() => viewer.updateSettings({ identity: auth.identity() }));
 *
 * Documents opened after a change of `identity` or `scope` use the new value; open ones keep
 * theirs.
 */
@Injectable({ providedIn: 'root' })
export class EpdfViewer {
  private readonly host = injectKernelHost('inject(EpdfViewer)');

  /** The viewer's settings: `identity`, `scope`, `accent` and `page`. */
  readonly settings: Signal<ViewerSettings> = this.host.viewerSettings;
  /** `'starting'`, `'ready'`, or `'error'` when the engine or a plugin failed to start. */
  readonly status: Signal<EpdfViewerStatus> = this.host.status;
  /** Why the viewer failed to start, when `status()` is `'error'`. */
  readonly error: Signal<unknown> = this.host.error;
  /** Fires once for each call that changed a setting. */
  readonly settingsChanged$: Observable<SettingsChangedEvent<ViewerSettings>> = this.host.stream(
    (kernel) => kernel.onSettingsChanged,
  );

  /** Merge `changes` into the viewer's settings: `page` merges, `identity` and `scope` replace. */
  updateSettings(changes: DeepPartial<ViewerSettings>): void {
    this.host.updateViewerSettings(changes);
  }

  /** Go back to the settings `provideEmbedPdf()` was given. */
  resetSettings(): void {
    this.host.resetViewerSettings();
  }
}

/**
 * The documents: open, close, unlock, retry and download them, and every tab with the active
 * one as signals (`documents()`, `activeId()`). Under `[epdfDocumentScope]` the calls that
 * leave out the document use that one: `download()` downloads the document in scope.
 */
@Injectable({ providedIn: 'root' })
export class EpdfDocuments extends pluginService({
  name: 'EpdfDocuments',
  token: DocumentsToken,
  state: documentsState,
  methods: [
    'open',
    'openAll',
    'retry',
    'rename',
    'unlock',
    'close',
    'closeAll',
    'setActive',
    'getActiveId',
    'getActive',
    'list',
    'get',
    'has',
    'getCount',
    'getOrder',
    'setOrder',
    'move',
    'swap',
    'download',
    'downloadLayer',
    'canDownload',
    'canPrint',
    'listPages',
    'getPage',
    'getPageIndex',
    'getRevision',
  ],
  events: [
    'onOpened',
    'onOpenFailed',
    'onLocked',
    'onClosed',
    'onActiveChanged',
    'onPagesChanged',
    'onUnsavedChangesChanged',
  ],
}) {}

const NO_PAGES: readonly PageInfo[] = Object.freeze([]);

/**
 * The document this part of the template talks to: the one `[epdfDocumentScope]` names, else
 * the active one. Its fields are signals (`id()`, `name()`, `status()`, `pageCount()`,
 * `hasUnsavedChanges()`, `passwordProvided()`, `error()`), and `pages()` its pages. With no
 * document it reads as one still on its way: an empty `id` and `status() === 'loading'`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfDocument extends pluginService({
  name: 'EpdfDocument',
  token: DocumentsToken,
  state: documentState,
  methods: [],
}) {
  /**
   * The document's pages, in order: each with its `ref`, `index`, `label`, size and rotation.
   * Needs no Stage. The same array until a page is added, removed, moved or rotated; empty
   * with no document.
   */
  readonly pages: Signal<readonly PageInfo[]> = this.binding.select(
    (documents) => documents.listPages(),
    NO_PAGES,
    Object.is,
  );
}
