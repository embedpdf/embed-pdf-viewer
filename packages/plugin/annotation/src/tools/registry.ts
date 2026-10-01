import {
  defaultsFor,
  kindNamed,
  propertiesOf,
  readOfDefaults,
  textOf,
  uprightRotation,
  type FieldValues,
  type KindName,
} from '@embedpdf/core-annotation';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import {
  buildToolRegistry,
  toolTouchOf,
  type AnnotationToolInput,
  type ResolvedTool,
} from './definitions';
import type { AnnotationProperties, AnnotationTool, ToolDefaults } from '../contract';
import { propertyValues } from '../read/property-values';
import type { AnnotationContext } from '../services/context';
import type { AnnotationEvents } from '../services/events';
import type { AnnotationStore } from '../services/store';

/**
 * The resolved tool table (built-ins + the `tools` setting). A tool is a named
 * authoring preset: it maps its id → a routing subtype, a `defaults` key
 * (`preset`), the kind whose properties it shows, and, for stamps, a source
 * spec. The setting's tools are kept so `tools.register` can re-resolve
 * `extends` against the same base pool.
 */
export function createToolRegistry(
  ctx: Pick<AnnotationContext, 'tryGet'>,
  settingTools: readonly AnnotationToolInput[],
  store: AnnotationStore,
  events: Pick<AnnotationEvents, 'toolDefaultsChanged'>,
) {
  const configTools = [...settingTools];
  const registry = buildToolRegistry(configTools);
  // Every tool's next annotation starts from its defaults.
  for (const tool of registry.values()) {
    if (tool.defaults) {
      store.commit({ type: 'setDefaults', preset: tool.preset, patch: tool.defaults });
    }
  }

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
   * A tool's defaults over the engine's for its kind, and the properties its
   * style panel edits with their values. Cached per tool while its defaults
   * stay the same object, so a subscribed panel re-renders only when they change.
   */
  const toolProperties = new Map<
    string,
    { own: FieldValues; defaults: FieldValues; properties: AnnotationProperties }
  >();
  const toolPropertiesOf = (toolId: string) => {
    const tool = registry.get(toolId);
    const kind = tool?.subtype ?? toolId;
    const own = defaultsFor(store.model(), tool?.preset ?? toolId);
    const cached = toolProperties.get(toolId);
    if (cached?.own === own) return cached;
    const read = readOfDefaults(kind, own);
    const { subtype: _kind, ...defaults } = read as unknown as Record<string, unknown>;
    // A tool's style panel edits its kind's properties: an arrow edits a line's.
    // The registry holds that mapping.
    const properties = propertiesOf(kindNamed(tool?.fieldsKind ?? toolId));
    const text = textOf(read);
    const target = read.subtype === 'link' ? (read.target ?? null) : null;
    const entry = {
      own,
      defaults,
      properties: {
        properties,
        values: propertyValues(properties, { data: defaults, text, link: target }),
        mixed: [],
      },
    };
    toolProperties.set(toolId, entry);
    return entry;
  };

  /** Merge fields into a tool's defaults, and say so; a change to the values they have changes nothing. */
  const updateDefaults = (toolId: string, changes: FieldValues): void => {
    const own = toolPropertiesOf(toolId).own;
    const changed = Object.entries(changes).some(
      ([key, value]) => JSON.stringify(own[key]) !== JSON.stringify(value),
    );
    if (!changed) return;
    store.commit({
      type: 'setDefaults',
      preset: registry.get(toolId)?.preset ?? toolId,
      patch: changes,
    });
    events.toolDefaultsChanged.emit({ toolId, defaults: toolPropertiesOf(toolId).defaults });
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
        ghost: tool.ghost,
        ...(tool.meta ? { meta: tool.meta } : {}),
      };
      toolProjections.set(tool, hit);
    }
    return hit;
  };

  const register = (definition: AnnotationToolInput) => {
    // Re-resolve against the same base pool so `extends` can reach built-ins /
    // setting tools, then register just this one with the hub + seed its defaults.
    const resolved = buildToolRegistry([...configTools, definition]).get(definition.id);
    if (!resolved) throw new Error(`[annotation] could not resolve tool '${definition.id}'`);
    registry.set(resolved.id, resolved);
    const un = ctx.tryGet(InteractionToken)?.registerTool(
      {
        id: resolved.id,
        cursor: resolved.cursor,
        enables: resolved.enables,
        touch: toolTouchOf(resolved.enables),
      },
      { replace: true },
    );
    if (resolved.defaults)
      store.commit({ type: 'setDefaults', preset: resolved.preset, patch: resolved.defaults });
    return () => {
      registry.delete(resolved.id);
      un?.();
    };
  };

  /** The `tools` noun. */
  const tools = {
    list: () => values().map(projectTool),
    get: (id: string) => {
      const tool = registry.get(id);
      return tool ? projectTool(tool) : null;
    },
    register,
    getDefaults: (toolId: string): ToolDefaults => toolPropertiesOf(toolId).defaults,
    updateDefaults,
    getProperties: (toolId: string): AnnotationProperties => toolPropertiesOf(toolId).properties,
    onDefaultsChanged: events.toolDefaultsChanged.on,
  };

  const api = {
    listResolvedTools: () => values(),
    getResolvedTool: (id: string) => registry.get(id) ?? null,
    getToolSubtype: (id: string) => registry.get(id)?.subtype ?? (id as KindName),
  };

  return { get, values, activeTool, uprightRotFor, tools, api };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
