import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { COLOR, LINKABLE, OPACITY } from './fields';
import { iconStyle } from './styles';

/** The `/Name` icons a note can show: the engine's `NoteIcon` names. */
const NOTE_ICONS = [
  'comment',
  'key',
  'note',
  'help',
  'new-paragraph',
  'paragraph',
  'insert',
] as const;

/**
 * A sticky note (`/Text`): a fixed icon whose drawing is the engine's
 * appearance (from `/C` and `/Name`). It keeps its size and stays upright on
 * screen, the spec's rule for note icons; its popup thread is what it is for.
 */
export const textNote = defineKind({
  name: 'text',
  family: boxFamily,
  style: iconStyle,
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    groupMovable: true,
    commentable: true,
    hasPopup: true,
    opaqueBody: true,
    noZoom: true,
    noRotate: true,
  },
  properties: [
    { key: 'icon', control: 'choice', label: 'Icon', options: NOTE_ICONS },
    COLOR,
    OPACITY,
    LINKABLE,
  ],
});
