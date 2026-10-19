import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/react/annotation';

// The box fills its frame (`width` and `height` 100% in your CSS) and draws
// it; the editor inside fills the box.
export function BrandedTextBox({ annotation }: AnnotationRendererProps) {
  const editor = useRichTextEditor(annotation);

  return (
    <div className={editor.editing ? 'text-box editing' : 'text-box'}>
      <div ref={editor.ref} style={editor.style} />
    </div>
  );
}
