import { Fragment, useMemo } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { MarqueeRedact } from './marquee-redact';
import { SelectionRedact } from './selection-redact';
import { PendingRedactions } from './pending-redactions';
import { Rotation } from '@embedpdf/models';
import { SelectionMenuProps } from './types';

interface RedactionLayerProps {
  /** The ID of the document this layer belongs to */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Current render scale for this page */
  scale?: number;
  /** Page rotation (for counter-rotating menus, etc.) */
  rotation?: Rotation;
  /** Optional menu renderer for a selected redaction */
  selectionMenu?: (props: SelectionMenuProps) => JSX.Element;
}

export const RedactionLayer = ({
  documentId,
  pageIndex,
  scale,
  rotation,
  selectionMenu,
}: RedactionLayerProps) => {
  const documentState = useDocumentState(documentId);

  const actualScale = useMemo(() => {
    if (scale !== undefined) return scale;
    return documentState?.scale ?? 1;
  }, [scale, documentState?.scale]);

  const actualRotation = useMemo(() => {
    if (rotation !== undefined) return rotation;
    return documentState?.rotation ?? Rotation.Degree0;
  }, [rotation, documentState?.rotation]);

  return (
    <Fragment>
      <PendingRedactions
        documentId={documentId}
        pageIndex={pageIndex}
        scale={actualScale}
        rotation={actualRotation}
        selectionMenu={selectionMenu}
      />
      <MarqueeRedact documentId={documentId} pageIndex={pageIndex} scale={actualScale} />
      <SelectionRedact documentId={documentId} pageIndex={pageIndex} scale={actualScale} />
    </Fragment>
  );
};
