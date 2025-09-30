/** @jsxImportSource preact */
import { h } from 'preact';
import { useAnnotationCapability, AnnotationTool } from '@embedpdf/plugin-annotation/preact';
import { PdfAnnotationSubtype, PdfAnnotationObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

import { SidebarPropsBase } from './annotation-sidebar/common';
import { SIDEbars } from './annotation-sidebar/registry';
import { EmptyState } from './annotation-sidebar/empty-state';

export function leftPanelAnnotationStyleRenderer({
  selectedAnnotation,
  activeToolId,
  colorPresets,
}: {
  selectedAnnotation: TrackedAnnotation | null;
  activeToolId: string | null;
  colorPresets: string[];
}) {
  const { provides: annotation } = useAnnotationCapability();
  if (!annotation) return null;

  let tool: AnnotationTool | null = null;
  let subtype: PdfAnnotationSubtype | null = null;

  // 1. Determine which tool and subtype we are working with
  if (selectedAnnotation) {
    // If an annotation is selected, find the best tool that matches it
    tool = annotation.findToolForAnnotation(selectedAnnotation.object);
    subtype = selectedAnnotation.object.type;
  } else if (activeToolId) {
    // If no annotation is selected, use the active tool from the toolbar
    tool = annotation.getTool(activeToolId) ?? null;
    subtype = tool?.defaults.type ?? null;
  }

  // 2. If we couldn't determine a subtype, show the empty state
  if (subtype === null) return <EmptyState />;

  const entry = SIDEbars[subtype];
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
