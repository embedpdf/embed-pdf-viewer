import { useFontsState } from '@embedpdf/react/fonts';

export function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const { fonts } = useFontsState();
  const choosable = fonts?.fonts.filter((font) => font.canChoose) ?? [];

  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {choosable.map((font) => (
        <option key={font.name} value={font.name}>
          {font.name}
        </option>
      ))}
    </select>
  );
}
