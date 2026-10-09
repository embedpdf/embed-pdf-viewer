/**
 * The metadata plugin's service and feature. The plugin keeps the metadata live off the
 * document's event stream, so the signals follow your own changes and other sessions' alike:
 *
 *   protected readonly metadata = inject(EpdfMetadata);
 *   title = computed(() => this.metadata.fields()?.title ?? '');
 *   await this.metadata.update({ title: 'New title' }); // resolves once fields() shows it
 *
 * The service is both the plugin's API and its state, so the plugin's State table reads a little
 * differently here: the standard fields are `fields()` (React's `metadata`), and your own fields
 * are the `custom` namespace with its own `fields()` and `status()`. A namespace is never itself
 * a signal.
 */
import { Injectable, type Signal } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import type { CustomMetadata, DocumentMetadata, ResourceStatus } from '@embedpdf/angular/runtime';
import { metadataPlugin, MetadataToken } from '@embedpdf/plugin-metadata';
import type {
  CustomMetadataCapability,
  CustomMetadataResyncedEvent,
  CustomMetadataUpdatedEvent,
} from '@embedpdf/plugin-metadata';
import type { Observable } from 'rxjs';

/** Your own fields of a document, as `metadata.custom`: the same reads and calls as the standard ones. */
export interface EpdfCustomMetadata {
  /** Your own fields, as `{ name: value }`, or null until they have loaded. */
  readonly fields: Signal<CustomMetadata | null>;
  /** `'idle'`, `'loading'`, `'ready'`, `'forbidden'` or `'error'`. */
  readonly status: Signal<ResourceStatus>;
  /** A string sets a field, `null` removes it, and the fields left out stay. Resolves `{ custom }`. */
  readonly update: CustomMetadataCapability['update'];
  /** Read your own fields from the file again. Rarely needed: they stay up to date by themselves. */
  readonly refresh: CustomMetadataCapability['refresh'];
  /** Your own fields, read once. */
  readonly getSnapshot: CustomMetadataCapability['getSnapshot'];
  /** Their load state, read once. */
  readonly getStatus: CustomMetadataCapability['getStatus'];
  /** Your own fields changed, by you or by someone else. */
  readonly updated$: Observable<CustomMetadataUpdatedEvent>;
  /** Your own fields were loaded from the file. */
  readonly resynced$: Observable<CustomMetadataResyncedEvent>;
}

/**
 * The metadata of the document in scope (`[epdfDocumentScope]`), else the active one: the
 * standard fields as `fields()`, their load state as `status()`, `update()`, `refresh()`, the
 * check `canUpdate()`, the streams `updated$` and `resynced$`, and your own fields as `custom`.
 * With no document the signals read null and `'idle'`, and every call refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfMetadata extends pluginService({
  name: 'EpdfMetadata',
  feature: 'withMetadata()',
  token: MetadataToken,
  methods: ['update', 'refresh', 'canUpdate', 'getSnapshot', 'getStatus'],
  events: ['onUpdated', 'onResynced'],
}) {
  /** Every standard field (`title`, `author`, …), or null until it has loaded. */
  readonly fields: Signal<DocumentMetadata | null> = this.binding.select(
    (metadata) => metadata.getSnapshot(),
    null,
    Object.is,
  );

  /** Whether the standard fields are still loading, there, or not allowed. */
  readonly status: Signal<ResourceStatus> = this.binding.select(
    (metadata) => metadata.getStatus(),
    'idle',
    Object.is,
  );

  /** Your own fields, kept in the document: a contract number, who reviewed it. */
  readonly custom: EpdfCustomMetadata = {
    fields: this.binding.select((metadata) => metadata.custom.getSnapshot(), null, Object.is),
    status: this.binding.select((metadata) => metadata.custom.getStatus(), 'idle', Object.is),
    update: this.binding.namespaceMethod('custom', 'update'),
    refresh: this.binding.namespaceMethod('custom', 'refresh'),
    getSnapshot: this.binding.namespaceMethod('custom', 'getSnapshot'),
    getStatus: this.binding.namespaceMethod('custom', 'getStatus'),
    updated$: this.binding.stream((metadata) => metadata.custom.onUpdated),
    resynced$: this.binding.stream((metadata) => metadata.custom.onResynced),
  };
}

/** Metadata, for `provideEmbedPdf()`. */
export function withMetadata(): EmbedPdfFeature {
  return { plugins: [metadataPlugin()], services: [EpdfMetadata] };
}
