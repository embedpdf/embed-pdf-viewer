import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/react/annotation';

// The element fills its frame (`width` and `height` 100% in your CSS).
export function BrandedTextBox({ annotation }: AnnotationRendererProps) {
  const editor = useRichTextEditor(annotation);

  return (
    <div
      ref={editor.ref}
      className={editor.editing ? 'text-box editing' : 'text-box'}
      style={editor.style}
    />
  );
}
