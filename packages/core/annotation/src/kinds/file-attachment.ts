import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { COLOR, OPACITY } from './fields';
import { iconStyle } from './styles';

/** The `/Name` icons an attachment can show: the engine's `FileAttachmentIcon` names. */
const FILE_ATTACHMENT_ICONS = ['push-pin', 'paperclip', 'graph', 'tag'] as const;

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
    { key: 'icon', control: 'choice', label: 'Icon', options: FILE_ATTACHMENT_ICONS },
    COLOR,
    OPACITY,
  ],
});
