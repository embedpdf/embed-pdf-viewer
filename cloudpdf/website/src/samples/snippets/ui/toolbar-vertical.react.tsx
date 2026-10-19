import { Toolbar, group } from '@embedpdf/react/toolbar';
import { Icon } from './icon';

const rail = {
  id: 'rail',
  sections: {
    start: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'])],
    end: [group('zoom', ['zoom:in', 'zoom:out'])],
  },
};

export function ToolRail() {
  return (
    <Toolbar
      bar={rail}
      orientation="vertical"
      aria-label="Tools"
      style={{ height: '100%' }}
      renderCommand={(command, _variant, run) => (
        <button onClick={run} disabled={!command.enabled} aria-pressed={command.active} title={command.label}>
          <Icon name={command.icon} />
        </button>
      )}
    />
  );
}
