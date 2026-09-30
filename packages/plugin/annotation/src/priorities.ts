/**
 * The interaction-hub priorities of the annotation plugin's handlers — the
 * public contract a sibling plugin builds on when it needs to sit above or
 * below one of them for the same gesture. Priority only breaks ties between
 * simultaneously-eligible handlers (the tool's tags decide eligibility).
 *
 *    100 annotation-edit    select/move/resize over an existing annotation
 *     95 annotation-place   click-to-place an armed payload on empty page space
 *     55 annotation-draw    drag-create under a draw tool (below text-select)
 *     50 annotation-marquee empty-space selection, the final fallback
 *
 * Hover runs in the same order, so a handler's hover sees the cursor claims
 * of every handler above it: a create handler shows its tool's ghost only
 * where nothing above it claims the pointer (an annotation, text).
 *
 * A handler that must win a click over an existing annotation while a
 * placing tool is active (a signature mark dropped onto a signature field)
 * registers above {@link ANNOTATION_EDIT_PRIORITY}, not merely above place:
 * the edit handler captures first over any annotation, a widget included.
 */
export const ANNOTATION_EDIT_PRIORITY = 100;
export const ANNOTATION_PLACE_PRIORITY = 95;
export const ANNOTATION_DRAW_PRIORITY = 55;
export const ANNOTATION_MARQUEE_PRIORITY = 50;
