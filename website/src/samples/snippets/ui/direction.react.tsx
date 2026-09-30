import { useI18nState } from '@embedpdf/react/i18n';

export function ViewerRoot() {
  const { direction } = useI18nState();

  return <div dir={direction}>{/* your viewer */}</div>;
}
