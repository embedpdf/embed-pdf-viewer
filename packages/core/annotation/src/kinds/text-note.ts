import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS, type AnnotationOption } from './define';
import { COLOR, LINKABLE, OPACITY } from './fields';
import { iconStyle } from './styles';

/** The `/Name` icons a note can show: the engine's `NoteIcon` names. */
const NOTE_ICONS: readonly AnnotationOption[] = [
  { value: 'comment', label: 'Comment', labelKey: 'annotation.noteIcons.comment' },
  { value: 'key', label: 'Key', labelKey: 'annotation.noteIcons.key' },
  { value: 'note', label: 'Note', labelKey: 'annotation.noteIcons.note' },
  { value: 'help', label: 'Help', labelKey: 'annotation.noteIcons.help' },
  {
    value: 'new-paragraph',
    label: 'New paragraph',
    labelKey: 'annotation.noteIcons.newParagraph',
  },
  { value: 'paragraph', label: 'Paragraph', labelKey: 'annotation.noteIcons.paragraph' },
  { value: 'insert', label: 'Insert', labelKey: 'annotation.noteIcons.insert' },
];

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
    {
      key: 'icon',
      control: 'choice',
      label: 'Icon',
      labelKey: 'annotation.style.icon',
      options: NOTE_ICONS,
    },
    COLOR,
    OPACITY,
    LINKABLE,
  ],
});
