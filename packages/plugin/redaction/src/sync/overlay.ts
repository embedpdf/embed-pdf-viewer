/**
 * The `overlay` settings as the redact tool's defaults. Every mark takes its
 * look from them: one drawn with the tool, one made from the selected text,
 * and one made from code (`write/marks.ts`). Written when the plugin
 * connects and again whenever the settings change, so a change applies to
 * the marks made from then on; marks already made keep theirs.
 */
import type { RedactionSettings } from '../contract';
import type { RedactionContext, RedactionServices } from '../services';

/** The redact tool's fields the overlay settings stand for. */
const toolDefaultsOf = ({ overlay }: RedactionSettings) => ({
  interiorColor: overlay.fill,
  fontColor: overlay.text.color,
  fontFamily: overlay.text.fontFamily,
  fontSize: overlay.text.fontSize,
});

export function syncOverlay(
  ctx: RedactionContext,
  { siblings }: Pick<RedactionServices, 'siblings'>,
): void {
  const { annotation } = siblings;
  const settings = ctx.settings();
  const write = () => annotation.tools.updateDefaults('redact', toolDefaultsOf(settings.get()));
  write();
  ctx.listen(settings.api.onSettingsChanged, ({ changed }) => {
    if (changed.includes('overlay')) write();
  });
}
