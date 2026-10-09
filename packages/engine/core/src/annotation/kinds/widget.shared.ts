import { z } from 'zod';

import type { WidgetAnnotation, WidgetPatch } from './widget';
import { WidgetDeclaration } from './widget/declaration';

const WIDGET_STYLE_NAMES = [
  'color',
  'interiorColor',
  'strokeWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
  'caption',
] as const;

type WidgetStyleName = (typeof WIDGET_STYLE_NAMES)[number];

/** A widget's appearance characteristics (`/MK`, a push button's caption among them) and default appearance (`/DA`). */
export type WidgetStyleFields = Pick<WidgetAnnotation, WidgetStyleName>;
export type WidgetStyleDraftFields = Pick<WidgetPatch, WidgetStyleName>;
export type WidgetStylePatchFields = WidgetStyleDraftFields;
export type WidgetAppearance = WidgetStyleDraftFields;

/** The style fields' schemas, as a widget annotation's update takes them. */
export const WIDGET_STYLE_SHAPE: Record<WidgetStyleName, z.ZodTypeAny> = Object.fromEntries(
  WIDGET_STYLE_NAMES.map((name) => [name, WidgetDeclaration.shapes.update[name]!]),
) as Record<WidgetStyleName, z.ZodTypeAny>;

export const WidgetAppearanceSchema = z
  .object(WIDGET_STYLE_SHAPE)
  .strict() as unknown as z.ZodType<WidgetAppearance>;
