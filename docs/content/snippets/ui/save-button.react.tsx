import { useT } from '@embedpdf/react/i18n';

export function SaveButton() {
  const t = useT();
  return <button>{t('toolbar.save')}</button>;
}
