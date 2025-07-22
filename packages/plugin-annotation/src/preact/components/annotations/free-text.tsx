import { Rect } from '@embedpdf/models';
import { useCapability } from '@embedpdf/core/preact';
import { RichTextPlugin } from '@embedpdf/plugin-rich-text';
import { RichTextEditor } from '@embedpdf/plugin-rich-text/preact';

interface FreeTextProps {
  richContent?: string;
  /** Bounding box of the whole annotation */
  rect: Rect;
  /** Page zoom factor */
  scale: number;
  /** Callback for when the annotation is clicked */
  onClick?: (e: MouseEvent) => void;
}

export function FreeText({ richContent, rect, scale, onClick }: FreeTextProps) {
  const { provides: richTextProvides } = useCapability<RichTextPlugin>('rich-text');

  if (!richTextProvides) return null;
  if (!richContent) return null;

  const { parseFromXHTML } = richTextProvides;

  console.log(richContent);

  const xhtml = parseFromXHTML(richContent);

  console.log(xhtml);

  return (
    <div
      style={{
        position: 'absolute',
        pointerEvents: 'auto',
        zIndex: 1000,
      }}
    >
      <RichTextEditor
        initialJson={xhtml}
        onChange={() => {}}
        onSelectionChange={() => {}}
        isEditing={true}
      />
    </div>
  );
}
