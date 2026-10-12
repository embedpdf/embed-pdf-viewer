/**
 * The headless services inside the viewer: the injector each viewer gives your templates holds
 * `provideEmbedPdf({ kernel })` with the viewer's kernel, the service of every plugin the viewer
 * has, and `EpdfStageRef` for its pages, so `inject(EpdfSearch)` there searches this viewer and
 * `inject(EpdfStageRef)` zooms it. The plugins are the viewer's; these are only their Angular
 * services, one copy of each with your app's.
 */
import type { Provider } from '@angular/core';
import { EpdfActions } from '@embedpdf/angular/actions';
import { EpdfAnnotation, EpdfComments } from '@embedpdf/angular/annotation';
import { EpdfCommands } from '@embedpdf/angular/commands';
import { EpdfForm } from '@embedpdf/angular/form';
import { EpdfHistory } from '@embedpdf/angular/history';
import { EpdfI18n } from '@embedpdf/angular/i18n';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import { EpdfLink } from '@embedpdf/angular/link';
import { EpdfMeasurement } from '@embedpdf/angular/measurement';
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

/** The service of each plugin the viewer registers, and its pages' Stage as `EpdfStageRef`. */
const VIEWER_SERVICES = [
  EpdfStageRef,
  EpdfRender,
  EpdfPageEdit,
  EpdfInteraction,
  EpdfSelection,
  EpdfAnnotation,
  EpdfComments,
  EpdfHistory,
  EpdfStamp,
  EpdfActions,
  EpdfForm,
  EpdfSignature,
  EpdfLink,
  EpdfRedaction,
  EpdfMeasurement,
  EpdfSearch,
  EpdfI18n,
  EpdfCommands,
  EpdfShell,
];

/** The headless viewer over `kernel`: its own services, and every plugin's. */
export const provideViewerServices = (kernel: Kernel): Provider[] =>
  provideEmbedPdf({ kernel }, { plugins: [], services: VIEWER_SERVICES });
