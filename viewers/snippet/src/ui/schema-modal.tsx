import { h, Fragment } from 'preact';
import { ModalSchema } from '@embedpdf/plugin-ui';
import { useItemRenderer } from '@embedpdf/plugin-ui/preact';

export interface ModalRendererProps {
  schema: ModalSchema;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onExited: () => void;
}

/**
 * Schema-driven Modal Renderer for Preact
 *
 * Renders modals defined in the UI schema.
 * Supports animation lifecycle via isOpen and onExited props.
 */
export function SchemaModal({ schema, documentId, isOpen, onClose, onExited }: ModalRendererProps) {
  const { content } = schema;
  const { renderCustomComponent } = useItemRenderer();

  if (content.type !== 'component') {
    console.warn(`SchemaModal only supports component content type, got: ${content.type}`);
    return null;
  }

  return (
    <Fragment>
      {renderCustomComponent(content.componentId, documentId, {
        isOpen,
        onClose,
        onExited,
      })}
    </Fragment>
  );
}
