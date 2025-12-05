import type { Action } from 'svelte/action';

export interface MenuWrapperProps {
  style: string;
  action: Action<HTMLElement>;
}
