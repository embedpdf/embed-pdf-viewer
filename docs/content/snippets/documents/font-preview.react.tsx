import { useFontCss } from '@embedpdf/react/fonts';

export function FontPreview({ font }: { font: string }) {
  // Its programs are mounted while this component lives.
  const css = useFontCss(font);

  return (
    <input
      defaultValue="Hello שלום"
      style={{
        fontFamily: css?.fontFamily,
        fontWeight: css?.fontWeight,
        fontStyle: css?.fontStyle,
        fontSynthesis: 'none',
      }}
    />
  );
}
