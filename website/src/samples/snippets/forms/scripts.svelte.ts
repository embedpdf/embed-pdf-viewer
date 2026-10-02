import { actionsPlugin } from '@embedpdf/svelte/actions';
import { formPlugin } from '@embedpdf/svelte/form';

export const plugins = [/* … */ formPlugin(), actionsPlugin({ javascript: { enabled: true } })];
