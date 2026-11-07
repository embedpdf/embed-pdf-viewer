/**
 * Once a document shows: read its outline and its attachments, so their panels' buttons know
 * whether the panels have a job (`config/panels.ts`). Reading a plugin's state is what reads it;
 * a viewer without the plugin reads nothing. Mounted once per document view; renders nothing.
 */
import { useAttachmentState } from '@embedpdf/react/attachment';
import { useOutlineState } from '@embedpdf/react/outline';

export function SidebarReads() {
  useOutlineState((state) => state.status);
  useAttachmentState((state) => state.status);
  return null;
}
