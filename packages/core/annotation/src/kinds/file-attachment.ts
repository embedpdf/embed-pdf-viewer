import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS, type AnnotationOption } from './define';
import { COLOR, OPACITY } from './fields';
import { iconStyle } from './styles';

/** The `/Name` icons an attachment can show: the engine's `FileAttachmentIcon` names. */
const FILE_ATTACHMENT_ICONS: readonly AnnotationOption[] = [
  { value: 'push-pin', label: 'Push pin', labelKey: 'annotation.attachmentIcons.pushPin' },
  { value: 'paperclip', label: 'Paperclip', labelKey: 'annotation.attachmentIcons.paperclip' },
  { value: 'graph', label: 'Graph', labelKey: 'annotation.attachmentIcons.graph' },
  { value: 'tag', label: 'Tag', labelKey: 'annotation.attachmentIcons.tag' },
];

/**
 * An embedded file shown as an icon (`/FileAttachment`): the note's fixed
 * icon, but what it is for is the file (open, download), not a popup.
 */
export const fileAttachment = defineKind({
  name: 'file-attachment',
  family: boxFamily,
  style: iconStyle,
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    groupMovable: true,
    commentable: true,
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
      options: FILE_ATTACHMENT_ICONS,
    },
    COLOR,
    OPACITY,
  ],
});
