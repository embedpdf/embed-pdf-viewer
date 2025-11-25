/** @jsxImportSource preact */
import { h } from 'preact';
import {
  useAnnotationCapability,
  AnnotationTool,
  useAnnotation,
} from '@embedpdf/plugin-annotation/preact';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { getAnnotationByUid } from '@embedpdf/plugin-annotation';

import { SidebarPropsBase } from './annotation-sidebar/common';
import { SidebarRegistry } from './annotation-sidebar/registry';
import { EmptyState } from './annotation-sidebar/empty-state';

export function AnnotationSidebar({ documentId }: { documentId: string }) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: annotation, state } = useAnnotation(documentId);
  if (!annotationCapability || !annotation) return null;

  const colorPresets = annotationCapability?.getColorPresets() ?? [];

  let tool: AnnotationTool | null = null;
  let subtype: PdfAnnotationSubtype | null = null;
  const selectedAnnotation = state.selectedUid
    ? getAnnotationByUid(state, state.selectedUid)
    : null;
  // 1. Determine which tool and subtype we are working with
  if (selectedAnnotation) {
    // If an annotation is selected, find the best tool that matches it
    tool = annotation.findToolForAnnotation(selectedAnnotation.object);
    subtype = selectedAnnotation.object.type;
  } else if (state.activeToolId) {
    // If no annotation is selected, use the active tool from the toolbar
    tool = annotation.getActiveTool() ?? null;
    subtype = tool?.defaults.type ?? null;
  }

  // 2. If we couldn't determine a subtype, show the empty state
  if (subtype === null) return <EmptyState />;

  const entry = SidebarRegistry[subtype];
  if (!entry) return <EmptyState />;

  const { component: Sidebar, title } = entry;

  // 3. Prepare the simplified props for the sidebar component
  const commonProps: SidebarPropsBase<any> = {
    selected: selectedAnnotation,
    activeTool: tool,
    colorPresets,
  };

  const computedTitle = typeof title === 'function' ? title(commonProps as any) : title;

  return (
    <div class="h-full overflow-y-auto p-4">
      {computedTitle && (
        <h2 class="text-md mb-4 font-medium">
          {computedTitle} {selectedAnnotation ? 'styles' : 'defaults'}
        </h2>
      )}
      <Sidebar {...(commonProps as any)} />
    </div>
  );
}
