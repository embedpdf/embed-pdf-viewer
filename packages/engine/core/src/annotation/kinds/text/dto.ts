import type { AnnotationBase } from '../../base';
import type { ColorStyleFields } from '../style.shared';
import type { NoteIcon } from './draft';

/**
 * Text annotation ("sticky note") — an icon-sized comment marker whose
 * conversation text lives in the base `contents` (and replies via
 * `inReplyTo`). Popup state (`/Popup`, `/Open`) is presentation-layer and
 * deliberately not modeled here.
 */
export type TextAnnotationDTO = AnnotationBase &
  ColorStyleFields & {
    subtype: 'text';
    /** `/Name` icon; an absent `/Name` reads as `'note'` (the ISO default). */
    icon: NoteIcon;
  };
