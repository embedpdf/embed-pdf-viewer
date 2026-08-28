import type { AnnotationBase } from '../../base';
import type { AnnotationState, AnnotationStateModel } from '../../primitives';
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
    /**
     * `/State` — ISO 32000 §12.5.6.3 annotation state, carried by a
     * review-status reply (a text annotation whose `inReplyTo` points at
     * the annotation being reviewed). Faithful read: `null` iff the key
     * is absent. ISO defaulting — a `stateModel` present with no explicit
     * `state` implies `none` (review) / `unmarked` (marked) — is a
     * thread-composer concern, deliberately not applied here.
     */
    state: AnnotationState | null;
    /** `/StateModel` — see {@link state}. `null` iff the key is absent. */
    stateModel: AnnotationStateModel | null;
  };
