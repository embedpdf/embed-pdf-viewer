import { Toolbar, custom, group } from '@embedpdf/react/toolbar';
import { PageNumberInput } from './page-number-input';
import { renderCommand } from './render-command';

const bar = {
  id: 'main',
  sections: {
    center: [group('page', [custom('page-number', 'page:go-to', { variants: ['full', 'compact'] })])],
  },
};

export function PageToolbar() {
  return (
    <Toolbar
      bar={bar}
      renderCommand={renderCommand}
      renderCustom={{ 'page-number': (variant) => <PageNumberInput compact={variant === 'compact'} /> }}
    />
  );
}
