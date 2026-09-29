import {
  defaultsFor,
  fieldsFor,
  readOfDefaults,
  styleOfDefaults,
  uprightRotation,
  type FieldValues,
  type Subtype,
} from '@embedpdf/core-annotation';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import {
  buildToolRegistry,
  isTouchDirect,
  type AnnotationToolInput,
  type ResolvedTool,
} from './definitions';
import type { AnnotationConfig, AnnotationTool, EditableFields } from '../contract';
import { fieldValues } from '../read/field-values';
import type { AnnotationContext } from '../services/context';
import type { AnnotationStore } from '../services/store';

/**
 * The resolved tool table (built-ins + config overrides). A tool is a named
 * authoring preset: it maps its id → a routing subtype, a `defaults` key
 * (`preset`), a `fieldsFor` kind, and — for stamps — a source spec. The config
 * tools are kept so `registerTool` can re-resolve `extends` against the same
 * base pool.
 */
export function createToolRegistry(
  ctx: Pick<AnnotationContext, 'tryGet'>,
  config: AnnotationConfig,
  store: AnnotationStore,
) {
  const configTools = config.tools ?? [];
  const registry = buildToolRegistry(configTools);

  const get = (id: string): ResolvedTool | undefined => registry.get(id);
  const values = (): ResolvedTool[] => [...registry.values()];

  /** The hub's active tool, resolved through this registry (undefined when
   *  no interaction plugin is present or the id is not an annotation tool). */
  const activeTool = (): ResolvedTool | undefined => {
    const ix = ctx.tryGet(InteractionToken);
    return ix ? registry.get(ix.getActiveToolId()) : undefined;
  };
  /** The active tool's upright counter-rotation for a click at `displayRotation`
   *  (0 when the tool doesn't ask for upright, or the display isn't rotated). */
  const uprightRotFor = (displayRotation?: number): number => {
    if (!displayRotation) return 0;
    const tool = activeTool();
    return tool?.upright ? uprightRotation(displayRotation) : 0;
  };

  /**
   * A tool's defaults over the engine's for its kind, and the fields its style
   * panel edits with their values. Cached per tool while its defaults stay the
   * same object, so a subscribed panel re-renders only when they change.
   */
  const toolFields = new Map<
    string,
    { own: FieldValues; defaults: FieldValues; fields: EditableFields }
  >();
  const toolFieldsOf = (toolId: string) => {
    const tool = registry.get(toolId);
    const kind = tool?.subtype ?? toolId;
    const own = defaultsFor(store.model(), tool?.preset ?? toolId);
    const cached = toolFields.get(toolId);
    if (cached?.own === own) return cached;
    const { subtype: _kind, ...defaults } = readOfDefaults(kind, own) as unknown as Record<
      string,
      unknown
    >;
    // A tool's style panel edits its kind's fields: a callout edits a free
    // text's, an arrow a line's. The registry holds that mapping.
    const fields = fieldsFor(tool?.fieldsKind ?? toolId);
    const { text, target } = styleOfDefaults(kind, own);
    const entry = {
      own,
      defaults,
      fields: {
        fields,
        values: fieldValues(fields, { data: defaults, text, link: target }),
        mixed: [],
      },
    };
    toolFields.set(toolId, entry);
    return entry;
  };

  const toolProjections = new WeakMap<ResolvedTool, AnnotationTool>();
  const projectTool = (tool: ResolvedTool): AnnotationTool => {
    let hit = toolProjections.get(tool);
    if (!hit) {
      hit = {
        id: tool.id,
        subtype: tool.subtype,
        preset: tool.preset,
        cursor: tool.cursor,
        enables: [...tool.enables],
        ...(tool.defaults ? { defaults: tool.defaults } : {}),
        ...(tool.flags ? { flags: tool.flags } : {}),
        upright: tool.upright,
      };
      toolProjections.set(tool, hit);
    }
    return hit;
  };

  const api = {
    listTools: () => values().map(projectTool),
    getTool: (id: string) => {
      const tool = registry.get(id);
      return tool ? projectTool(tool) : null;
    },
    registerTool: (definition: AnnotationToolInput) => {
      // Re-resolve against the same base pool so `extends` can reach built-ins /
      // config tools, then register just this one with the hub + seed its defaults.
      const resolved = buildToolRegistry([...configTools, definition]).get(definition.id);
      if (!resolved) throw new Error(`[annotation] could not resolve tool '${definition.id}'`);
      registry.set(resolved.id, resolved);
      const un = ctx.tryGet(InteractionToken)?.registerTool(
        {
          id: resolved.id,
          cursor: resolved.cursor,
          enables: resolved.enables,
          touchDirect: isTouchDirect(resolved.enables),
        },
        { replace: true },
      );
      if (resolved.defaults)
        store.commit({ type: 'setDefaults', preset: resolved.preset, patch: resolved.defaults });
      return () => {
        registry.delete(resolved.id);
        un?.();
      };
    },
    getToolDefaults: (toolId: string): FieldValues => toolFieldsOf(toolId).defaults,
    updateToolDefaults: (toolId: string, patch: FieldValues) => {
      store.commit({ type: 'setDefaults', preset: registry.get(toolId)?.preset ?? toolId, patch });
    },
    getToolFields: (toolId: string): EditableFields => toolFieldsOf(toolId).fields,
    listResolvedTools: () => values(),
    getResolvedTool: (id: string) => registry.get(id) ?? null,
    getToolSubtype: (id: string) => registry.get(id)?.subtype ?? (id as Subtype),
  };

  return { get, values, activeTool, uprightRotFor, api };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
