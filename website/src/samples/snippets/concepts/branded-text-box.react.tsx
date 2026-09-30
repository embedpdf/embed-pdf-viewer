import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/react/annotation';

export function BrandedTextBox({ annotation, box, page }: AnnotationRendererProps) {
  const editor = useRichTextEditor(annotation, page);
  const { x, y, width, height } = page.transform.pageToViewRect(box);

  return (
    <div
      ref={editor.ref}
      className={editor.editing ? 'text-box editing' : 'text-box'}
      style={{ position: 'absolute', left: x, top: y, width, height, ...editor.style }}
    />
  );
}
