<!--
  A checkbox or a radio button: the field's picture is the control, so the box itself takes the
  role, the tab stop and the keys. A click, Space or Enter writes the toggled value, then runs
  the widget's action (Acrobat's order: `@embedpdf/web`'s `pressToggle`). A radio button's label
  names its option, and it says where it comes in its group: its buttons are placed apart, so no
  group element can.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // The value write and the activation go through the host lens, like the rest of the layer.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import { pressToggle } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { useCapability } from '../runtime/readers.svelte';
  import FormFocusRing from './FormFocusRing.svelte';
  import { useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'toggle' }>; colors: FormColors } = $props();

  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(() => item.annotationRef);
  let focused = $state(false);
  const inGroup = $derived(item.kind === 'radio' ? item.inGroup : null);

  // The value first, then the widget's action.
  const press = () => pressToggle(form, item, activate);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    press();
  }
</script>

<WidgetBox
  {item}
  {colors}
  role={item.kind === 'checkbox' ? 'checkbox' : 'radio'}
  aria-checked={item.checked}
  aria-label={item.label}
  aria-posinset={inGroup?.position}
  aria-setsize={inGroup?.size}
  tabindex={item.disabled ? -1 : 0}
  onclick={press}
  onkeydown={onKeyDown}
  onfocus={() => (focused = true)}
  onblur={() => (focused = false)}
  style="cursor: {item.disabled ? 'default' : 'pointer'}; outline: none"
>
  <FormFocusRing visible={focused} color={colors.focus} />
</WidgetBox>
