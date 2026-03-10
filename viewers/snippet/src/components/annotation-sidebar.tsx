/** @jsxImportSource preact */
import { h } from 'preact';
import { useAnnotationCapability, useAnnotation } from '@embedpdf/plugin-annotation/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { getSelectedAnnotations } from '@embedpdf/plugin-annotation';

import { EmptyState } from './annotation-sidebar/empty-state';
import { DynamicSidebar } from './annotation-sidebar/dynamic-sidebar';
import { TOOL_PROPERTIES } from './annotation-sidebar/property-schema';

export function AnnotationSidebar({ documentId }: { documentId: string }) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: annotation, state } = useAnnotation(documentId);
  const { translate } = useTranslations(documentId);

  if (!annotationCapability || !annotation) return null;

  const colorPresets = annotationCapability?.getColorPresets() ?? [];
  const selectedAnnotations = getSelectedAnnotations(state);
  const activeTool = annotation.getActiveTool();

  // Determine mode
  const isEditing = selectedAnnotations.length > 0;
  const isMulti = selectedAnnotations.length > 1;

  // Resolve tool for title and hasProperties check
  const resolvedTool = isEditing
    ? annotation.findToolForAnnotation(selectedAnnotations[0].object)
    : activeTool;

  // Compute title using the matched tool's translated label
  const toolLabel = translate(resolvedTool?.labelKey ?? '', { fallback: resolvedTool?.name ?? '' });

  let title = '';
  if (isMulti) {
    title = translate('annotation.multiSelect', {
      params: { count: String(selectedAnnotations.length) },
    });
  } else if (isEditing && resolvedTool) {
    title = translate('annotation.styles', { params: { type: toolLabel } });
  } else if (activeTool) {
    title = translate('annotation.defaults', { params: { type: toolLabel } });
  }

  // Check if we have properties to show via the tool-based mapping
  const toolId = resolvedTool?.id;
  const hasProperties = toolId !== undefined && (TOOL_PROPERTIES[toolId]?.length ?? 0) > 0;

  if (!hasProperties && !isEditing && !activeTool) {
    return <EmptyState documentId={documentId} />;
  }

  return (
    <div class="h-full overflow-y-auto p-4">
      {title && <h2 class="text-md mb-4 font-medium">{title}</h2>}
      <DynamicSidebar
        documentId={documentId}
        annotations={selectedAnnotations}
        activeTool={activeTool}
        colorPresets={colorPresets}
      />
    </div>
  );
}
