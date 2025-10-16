import { ZoomToolbar } from './zoom-toolbar';
import { PanToggleButton } from './pan-toggle';

type ViewerToolbarProps = {
  documentId: string;
};

export function ViewerToolbar({ documentId }: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
      <PanToggleButton documentId={documentId} />
      <ZoomToolbar documentId={documentId} />
    </div>
  );
}
