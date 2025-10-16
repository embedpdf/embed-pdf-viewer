import { ZoomToolbar } from './zoom-toolbar';
import { PanToggleButton } from './pan-toggle';
import { PageSettingsMenu } from './page-settings-menu';

type ViewerToolbarProps = {
  documentId: string;
};

export function ViewerToolbar({ documentId }: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
      <PanToggleButton documentId={documentId} />
      <PageSettingsMenu documentId={documentId} />
      <ZoomToolbar documentId={documentId} />
    </div>
  );
}
