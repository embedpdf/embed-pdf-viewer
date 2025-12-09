import { h } from 'preact';
import { Icon } from '../ui/icon';

export const EmptyState = () => (
  <div class="text-fg-muted flex flex-col items-center gap-2 p-4">
    <Icon icon="comment" className="h-18 w-18 text-fg-muted" />
    <div className="text-fg-muted max-w-[150px] text-center text-sm">
      Add annotations to be able to comment on them.
    </div>
  </div>
);
