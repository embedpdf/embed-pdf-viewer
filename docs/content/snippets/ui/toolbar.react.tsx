import { Toolbar, group, item } from '@embedpdf/react/toolbar';
import { Icon } from './icon';

const bar = {
  id: 'main',
  sections: {
    start: [group('navigation', ['page:previous', 'page:next'])],
    center: [group('zoom', ['zoom:out', item('zoom:in', { variants: ['icon+label', 'icon'] })])],
    end: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'], { collapse: 'menu' })],
  },
};

export function MainToolbar() {
  return (
    <Toolbar
      bar={bar}
      renderCommand={(command, variant, run) => (
        <button onClick={run} disabled={!command.enabled} aria-pressed={command.active} title={command.label}>
          <Icon name={command.icon} />
          {variant === 'icon+label' && command.label}
        </button>
      )}
    />
  );
}
