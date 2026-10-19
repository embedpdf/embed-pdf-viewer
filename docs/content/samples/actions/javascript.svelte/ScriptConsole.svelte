<!-- Edit the script and run it. Its alerts and its errors show below it. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    useActions,
    useActionsEvent,
    useActionsUiAdapter,
    type ActionContext,
    type PdfActionTree,
  } from '@embedpdf/svelte/actions';

  // A JavaScript action, as a PDF carries it behind a button or a link.
  const script = (code: string): PdfActionTree => ({
    root: { type: 'javascript', subtype: 'JavaScript', script: code, next: [] },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  });
  const click: ActionContext = {
    origin: 'user',
    source: { kind: 'api' },
    event: { scope: 'activate' },
  };

  const GREETING = "app.alert('Hello, ' + identity.name + ' from ' + identity.corporation + '!');";

  const actions = useActions();
  let code = $state(GREETING);
  let output = $state<Array<{ kind: 'alert' | 'error'; text: string }>>([]);
  const show = (kind: 'alert' | 'error', text: string) => {
    output = [{ kind, text }, ...output].slice(0, 5);
  };

  // A script's alert goes to your UI adapter: here, a line below the script.
  useActionsUiAdapter({ alert: (message) => show('alert', message) });
  useActionsEvent(
    (capability) => capability.onScriptFailed,
    ({ error }) => show('error', error.message),
  );

  // The greeting runs once on load.
  onMount(() => {
    void actions.execute(script(GREETING), click);
  });
</script>

<section class="panel">
  <label class="name" for="script">
    Script {actions.isScriptingEnabled() ? '' : '(JavaScript is off)'}
  </label>
  <textarea id="script" class="code" spellcheck={false} rows={3} bind:value={code}></textarea>
  <div class="actions">
    <button type="button" class="button primary" onclick={() => actions.execute(script(code), click)}>
      Run
    </button>
    <button type="button" class="button" onclick={() => (code = 'app.alrt("typo");')}>
      A script with a mistake
    </button>
  </div>
  <ol class="output" aria-live="polite">
    {#each output as line, index (output.length - index)}
      <li class={line.kind}>{line.text}</li>
    {/each}
  </ol>
</section>
