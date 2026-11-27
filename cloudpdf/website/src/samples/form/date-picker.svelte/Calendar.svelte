<!-- A month of days. `shown` is the day the field holds, when it holds one. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { DatePartsInput } from '@embedpdf/svelte/form';
  import { MONTHS, daysOf, today } from './days';

  let {
    shown,
    onPick,
  }: {
    shown: DatePartsInput | null;
    onPick: (day: DatePartsInput) => void;
  } = $props();

  // It opens on the month of the day the field holds, or on this month.
  const start = untrack(() => shown ?? today());
  let year = $state(start.year);
  let month = $state(start.month);

  function turn(by: number) {
    const next = new Date(year, month - 1 + by, 1);
    year = next.getFullYear();
    month = next.getMonth() + 1;
  }
</script>

<div class="calendar" role="group" aria-label="Pick a date">
  <div class="calendar-bar">
    <button type="button" class="calendar-turn" aria-label="Month before" onclick={() => turn(-1)}>
      ‹
    </button>
    <span class="calendar-month">{MONTHS[month - 1]} {year}</span>
    <button type="button" class="calendar-turn" aria-label="Month after" onclick={() => turn(1)}>
      ›
    </button>
  </div>
  <div class="calendar-days">
    {#each daysOf(year, month) as day, at (at)}
      {#if day === null}
        <span></span>
      {:else}
        <button
          type="button"
          class="calendar-day"
          aria-pressed={shown?.year === year && shown.month === month && shown.day === day}
          onclick={() => onPick({ year, month, day })}
        >
          {day}
        </button>
      {/if}
    {/each}
  </div>
</div>
