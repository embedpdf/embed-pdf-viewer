<script lang="ts">
  interface IconProps {
    class?: string;
    title?: string;
  }

  let { class: className, title }: IconProps = $props();
</script>

<svg
  class={className}
  fill="none"
  stroke="currentColor"
  viewBox="0 0 24 24"
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width={2}
  aria-hidden={!title}
  role={title ? 'img' : 'presentation'}
>
  {#if title}
    <title>{title}</title>
  {/if}
  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
  <path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" />
</svg>
