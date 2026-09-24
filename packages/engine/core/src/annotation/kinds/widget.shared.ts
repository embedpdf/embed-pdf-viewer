import { z } from 'zod';

import type { WidgetAnnotationDTO, WidgetPatch } from './widget';
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
] as const;

type WidgetStyleName = (typeof WIDGET_STYLE_NAMES)[number];

/** A widget's appearance characteristics (`/MK`) and default appearance (`/DA`). */
export type WidgetStyleFields = Pick<WidgetAnnotationDTO, WidgetStyleName>;
export type WidgetStyleDraftFields = Pick<WidgetPatch, WidgetStyleName>;
export type WidgetStylePatchFields = WidgetStyleDraftFields;
export type WidgetAppearance = WidgetStyleDraftFields;

export const WidgetAppearanceSchema = z
  .object(
    Object.fromEntries(
      WIDGET_STYLE_NAMES.map((name) => [name, WidgetDeclaration.shapes.update[name]!]),
    ),
  )
  .strict() as unknown as z.ZodType<WidgetAppearance>;
