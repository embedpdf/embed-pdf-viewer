/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorView } from 'prosemirror-view';
import { useRichTextCapability } from '../hooks';

export type RichTextEditorProps = {
  initialJson: any;
  onChange: (newJson: any) => void;
  onSelectionChange?: (activeMarks: Record<string, boolean | string>) => void;
  isEditing?: boolean;
};

export function RichTextEditor({
  initialJson,
  onChange,
  onSelectionChange,
  isEditing = true,
}: RichTextEditorProps): JSX.Element | null {
  const ref = useRef(null);
  const { provides: rt } = useRichTextCapability();
  if (!rt) return null;
  const [editorState, setEditorState] = useState(rt.createEditorState(initialJson));

  useEffect(() => {
    if (!ref.current || !isEditing) return;

    const view = new EditorView(ref.current, {
      state: editorState,
      dispatchTransaction: (tr) => {
        if (!editorState) return;
        const newState = rt.applyTransaction(editorState, tr);
        setEditorState(newState);
        if (tr.docChanged) onChange(rt.getJsonFromState(newState));
      },
      handleDOMEvents: {
        // Optional: On selection change, query active marks
        selectionchange: () => {
          if (onSelectionChange && editorState) onSelectionChange(rt.getActiveMarks(editorState));
          return true;
        },
      },
    });

    return () => view.destroy();
  }, [editorState, isEditing, rt]);

  if (!isEditing) {
    return <div dangerouslySetInnerHTML={{ __html: rt.serializeToXHTML(initialJson) }} />;
  }

  return <div ref={ref} />;
}
