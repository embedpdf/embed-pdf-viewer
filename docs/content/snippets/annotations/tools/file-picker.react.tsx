import { useFilePickerProvider } from '@embedpdf/react/annotation';

export function Toolbar() {
  useFilePickerProvider();

  return <div role="toolbar">{/* your tools */}</div>;
}
