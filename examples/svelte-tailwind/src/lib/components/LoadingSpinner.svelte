<script lang="ts">
  interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    message?: string;
    class?: string;
  }

  let { size = 'md', message, class: className = '' }: LoadingSpinnerProps = $props();

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
  };
</script>

<div class="flex items-center gap-2 text-gray-600 {className}">
  <svg class="{sizeClasses[size]} animate-spin" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
  {#if message}
    <span>{message}</span>
  {/if}
</div>
