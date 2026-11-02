/**
 * The headless services inside the viewer: the injector each viewer gives your templates holds
 * `provideEmbedPdf({ kernel })` with the viewer's kernel, the service of every plugin the viewer
 * has, and `EpdfStageRef` for its pages, so `inject(EpdfSearch)` there searches this viewer and
 * `inject(EpdfStageRef)` zooms it. The plugins are the viewer's; these are only their Angular
 * services, one copy of each with your app's.
 */
import type { Provider, Type } from '@angular/core';
import { EpdfActions } from '@embedpdf/angular/actions';
import { EpdfAnnotation, EpdfComments } from '@embedpdf/angular/annotation';
import { EpdfAttachment } from '@embedpdf/angular/attachment';
import { EpdfCommands } from '@embedpdf/angular/commands';
import { EpdfFonts } from '@embedpdf/angular/fonts';
import { EpdfForm } from '@embedpdf/angular/form';
import { EpdfHistory } from '@embedpdf/angular/history';
import { EpdfI18n } from '@embedpdf/angular/i18n';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import { EpdfLink } from '@embedpdf/angular/link';
import { EpdfMeasurement } from '@embedpdf/angular/measurement';
import { EpdfMetadata } from '@embedpdf/angular/metadata';
import { EpdfOutline } from '@embedpdf/angular/outline';
import { EpdfPageEdit } from '@embedpdf/angular/page-edit';
import { EpdfRedaction } from '@embedpdf/angular/redaction';
import { EpdfRender } from '@embedpdf/angular/render';
import { provideEmbedPdf, type Kernel } from '@embedpdf/angular/runtime';
import { EpdfSearch } from '@embedpdf/angular/search';
import { EpdfSelection } from '@embedpdf/angular/selection';
import { EpdfShell } from '@embedpdf/angular/shell';
import { EpdfSignature } from '@embedpdf/angular/signature';
import { EpdfStageRef } from '@embedpdf/angular/stage';
import { EpdfStamp } from '@embedpdf/angular/stamp';
import type { PluginName } from '@embedpdf/viewer/core';

/**
 * The services of each plugin the viewer has, by its name in `viewer.get()`, so a plugin the
 * viewer gains can't go without its service. `thumbnails` is the viewer's own panel, and
 * `provideEmbedPdf` gives `documents` its `EpdfDocuments`.
 */
const SERVICES_BY_PLUGIN: { readonly [Name in PluginName]: readonly Type<unknown>[] } = {
  stage: [EpdfStageRef],
  thumbnails: [],
  render: [EpdfRender],
  link: [EpdfLink],
  selection: [EpdfSelection],
  search: [EpdfSearch],
  annotation: [EpdfAnnotation, EpdfComments],
  stamp: [EpdfStamp],
  measurement: [EpdfMeasurement],
  redaction: [EpdfRedaction],
  form: [EpdfForm],
  signature: [EpdfSignature],
  pageEdit: [EpdfPageEdit],
  metadata: [EpdfMetadata],
  fonts: [EpdfFonts],
  outline: [EpdfOutline],
  attachment: [EpdfAttachment],
  actions: [EpdfActions],
  documents: [],
  interaction: [EpdfInteraction],
  commands: [EpdfCommands],
  shell: [EpdfShell],
  i18n: [EpdfI18n],
};

/** Every plugin's services, and the history's: the viewer registers it without a name. */
const VIEWER_SERVICES: readonly Type<unknown>[] = [
  ...Object.values(SERVICES_BY_PLUGIN).flat(),
  EpdfHistory,
];

/** The headless viewer over `kernel`: its own services, and every plugin's. */
export const provideViewerServices = (kernel: Kernel): Provider[] =>
  provideEmbedPdf({ kernel }, { plugins: [], services: VIEWER_SERVICES });
