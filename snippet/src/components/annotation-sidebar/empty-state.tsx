import { h } from 'preact';
import { Icon } from '../ui/icon';

export const EmptyState = () => (
  <div class="text-fg-muted flex flex-col items-center gap-2 p-4">
    <Icon icon="palette" className="h-18 w-18 text-fg-muted" />
    <div className="text-fg-muted max-w-[150px] text-center text-sm">
      Select an annotation to see styles
    </div>
  </div>
);
