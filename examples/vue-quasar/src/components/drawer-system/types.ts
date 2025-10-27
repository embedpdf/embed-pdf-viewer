export type DrawerPosition = 'left' | 'right';

export interface DrawerComponent {
  id: string;
  component: any; // Vue component
  icon: string; // Material Design Icon name
  label: string;
  position: DrawerPosition;
  props?: Record<string, any>;
}

export interface DrawerState {
  isOpen: boolean;
  activeComponentId: string | null;
}
