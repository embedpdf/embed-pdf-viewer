/**
 * @embedpdf/react/controller: a custom UI in a few lines.
 *
 * `<DocumentView>` shows the document in scope with every page layer a reader expects (pictures,
 * text selection, search hits, links, annotations, form fields) and copying wired. Put your own
 * buttons next to it, inside the same `<Viewer>`, and drive them with `useViewerController()`:
 * one state snapshot and the common commands, from `@embedpdf/web/controller`.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type React from 'react';
import {
  createViewerController,
  type ViewerController,
  type ViewerState,
} from '@embedpdf/web/controller';
import type { FailedDocumentInfo, LockedDocumentInfo } from '@embedpdf/core';
import { AnnotationLayer } from './annotation';
import { FormLayer } from './form';
import { LinkLayer } from './link';
import { RenderLayer } from './render';
import { DocumentGate, useDocumentScope, useKernel, type PageContextValue } from './runtime';
import { SearchLayer } from './search';
import { SelectionClipboard, SelectionLayer } from './selection';
import { Stage } from './stage';

export * from '@embedpdf/web/controller';

/** The controller, and the snapshot this render reads. */
export interface ViewerControllerHandle extends ViewerController {
  readonly state: ViewerState;
}

/**
 * The viewer controller for the document in scope (the active one outside a
 * `<DocumentScope>`), inside `<Viewer>`. Re-renders when its snapshot changes.
 */
export function useViewerController(): ViewerControllerHandle {
  const kernel = useKernel();
  const scope = useDocumentScope();
  const controller = useMemo(
    () => createViewerController(kernel, { documentId: () => scope }),
    [kernel, scope],
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return useMemo(() => ({ ...controller, state }), [controller, state]);
}

export interface DocumentViewProps {
  /** The layers of each page; default: picture, selection, search hits, links, annotations, form fields. */
  page?: (page: PageContextValue) => React.ReactNode;
  fallback?: React.ReactNode;
  locked?: (document: LockedDocumentInfo) => React.ReactNode;
  error?: (document: FailedDocumentInfo) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const defaultLayers = () => (
  <>
    <RenderLayer />
    <SelectionLayer />
    <SearchLayer />
    <LinkLayer />
    <AnnotationLayer />
    <FormLayer />
  </>
);

/** The document in scope, ready to read: a Stage with the page layers and copying wired. */
export function DocumentView({
  page = defaultLayers,
  fallback,
  locked,
  error,
  className,
  style,
}: DocumentViewProps) {
  return (
    <DocumentGate fallback={fallback} locked={locked} error={error}>
      <SelectionClipboard />
      <Stage className={className} style={{ width: '100%', height: '100%', ...style }}>
        {page}
      </Stage>
    </DocumentGate>
  );
}
