<script lang="ts">
  const HATCH_SPACING_PX = 7;
  const HATCH_LINE_PX = 1;

  interface Props {
    id: string;
    color: string;
    scale: number;
  }

  let { id, color, scale }: Props = $props();

  const s = $derived(scale > 0 ? scale : 1);
  const spacing = $derived(HATCH_SPACING_PX / s);
  const lineW = $derived(HATCH_LINE_PX / s);
</script>

<defs>
  <pattern {id} patternUnits="userSpaceOnUse" width={spacing} height={spacing} patternTransform="rotate(45)">
    <line x1={0} y1={0} x2={0} y2={spacing} stroke={color} stroke-width={lineW} opacity={0.4} />
  </pattern>
</defs>
