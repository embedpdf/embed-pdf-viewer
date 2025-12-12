import { h, JSX } from 'preact';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useUICapability } from '@embedpdf/plugin-ui/preact';

type AnnotationMenuProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'style'> & {
  trackedAnnotation: TrackedAnnotation;
  style?: JSX.CSSProperties;
};

export const AnnotationMenu = ({ trackedAnnotation, ...props }: AnnotationMenuProps) => {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: ui } = useUICapability();

  const handleDeleteClick = () => {
    annotationCapability?.deleteAnnotation(
      trackedAnnotation.object.pageIndex,
      trackedAnnotation.object.id,
    );
  };

  const handleStyleClick = () => {
    ui?.togglePanel({
      id: 'leftPanel',
      visibleChild: 'leftPanelAnnotationStyle',
      open: true,
    });
  };

  const handleCommentClick = () => {
    ui?.togglePanel({
      id: 'rightPanel',
      visibleChild: 'comment',
      open: true,
    });
  };

  return (
    <div
      {...props}
      className="flex flex-row gap-1 rounded-md border border-[#cfd4da] bg-[#f8f9fa] p-1"
    >
      <Button onClick={handleDeleteClick}>
        <Icon icon="trash" className="h-5 w-5" />
      </Button>
      <Button onClick={handleCommentClick}>
        <Icon icon="comment" className="h-5 w-5" />
      </Button>
      <Button onClick={handleStyleClick}>
        <Icon icon="palette" className="h-5 w-5" />
      </Button>
    </div>
  );
};
