import { h, Fragment } from 'preact';

import { PdfAnnotationObject } from '@embedpdf/models';
import { AnnotationTool, TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

import { PROPERTY_CONFIGS, getSharedProperties } from './property-schema';
import { PropertySection } from './property-sections';

/* ═══════════════════════════════════════════════════════════════════════════
 * Types
 * ═══════════════════════════════════════════════════════════════════════════ */

interface DynamicSidebarProps {
  documentId: string;
  /** Selected annotations - length 0 = tool defaults, 1 = single, 2+ = multi */
  annotations: TrackedAnnotation[];
  /** The currently active tool (used when no annotations selected) */
  activeTool: AnnotationTool | null;
  /** Color presets for color pickers */
  colorPresets: string[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Dynamic Sidebar Component
 *
 * A unified sidebar that works for:
 * - Single annotation editing
 * - Multiple annotation editing (batch)
 * - Tool defaults editing
 *
 * Dynamically renders property controls based on the property schema.
 * Uses tool matching (via matchScore) to resolve which properties to show,
 * enabling distinct property lists for tools sharing the same annotation subtype.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function DynamicSidebar({
  documentId,
  annotations,
  activeTool,
  colorPresets,
}: DynamicSidebarProps) {
  const { provides: annotation } = useAnnotationCapability();
  const { translate } = useTranslations(documentId);

  if (!annotation) return null;

  // Determine mode
  const isEditing = annotations.length > 0;

  // Resolve tool IDs: match each annotation to its best tool, or use the active tool
  const toolIds: string[] = isEditing
    ? annotations
        .map((a) => annotation.findToolForAnnotation(a.object)?.id)
        .filter((id): id is string => id !== undefined)
    : activeTool
      ? [activeTool.id]
      : [];

  if (toolIds.length === 0) return null;

  // Get shared properties for the matched tools, filtering out
  // edit-only properties (e.g. rotation) when editing tool defaults
  const sharedProperties = getSharedProperties(toolIds);
  const properties = isEditing
    ? sharedProperties
    : sharedProperties.filter((p) => !PROPERTY_CONFIGS[p]?.editOnly);

  // If no properties to show, don't render
  if (properties.length === 0) return null;

  // Get values from first annotation or tool defaults
  const source = isEditing ? annotations[0].object : activeTool?.defaults;

  /**
   * Unified patch function that handles all three modes:
   * - Single annotation: update that annotation
   * - Multiple annotations: batch update all selected
   * - Tool defaults: update the tool's default settings
   */
  const applyPatch = (patch: Partial<PdfAnnotationObject>) => {
    if (!annotation) return;

    if (isEditing) {
      // Batch update all selected annotations
      annotation.updateAnnotations(
        annotations.map((a) => ({
          pageIndex: a.object.pageIndex,
          id: a.object.id,
          patch,
        })),
      );
    } else if (activeTool) {
      // Update tool defaults
      annotation.setToolDefaults(activeTool.id, patch);
    }
  };

  /**
   * Get the value of a property from the source object.
   * Handles special cases like strokeStyle which may need strokeDashArray.
   */
  const getValue = (propKey: string): any => {
    if (!source) return undefined;

    const config = PROPERTY_CONFIGS[propKey];
    if (!config) return undefined;

    // Special case: strokeStyle needs both style and dash array
    if (config.type === 'strokeStyle') {
      const obj = source as any;
      return {
        id: obj.strokeStyle,
        dash: obj.strokeDashArray,
      };
    }

    return (source as any)[config.key];
  };

  /**
   * Handle value changes from property sections.
   * Some sections return complex objects that need to be flattened.
   */
  const handleChange = (propKey: string, value: any) => {
    const config = PROPERTY_CONFIGS[propKey];
    if (!config) return;

    // Special case: strokeStyle returns both style and dash array
    if (config.type === 'strokeStyle' && typeof value === 'object') {
      applyPatch({
        strokeStyle: value.strokeStyle,
        strokeDashArray: value.strokeDashArray,
      });
      return;
    }

    // Special case: lineEndings returns the full object
    if (config.type === 'lineEndings') {
      applyPatch({ lineEndings: value });
      return;
    }

    // Standard case: single property
    applyPatch({ [config.key]: value });
  };

  return (
    <Fragment>
      {properties.map((propKey) => {
        const config = PROPERTY_CONFIGS[propKey];
        if (!config) return null;

        return (
          <PropertySection
            key={propKey}
            config={config}
            value={getValue(propKey)}
            onChange={(v) => handleChange(propKey, v)}
            colorPresets={colorPresets}
            translate={translate}
          />
        );
      })}
    </Fragment>
  );
}
