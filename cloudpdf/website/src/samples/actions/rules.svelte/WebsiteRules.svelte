<!-- The rules for websites, changed while the app runs, and what happens when the link runs. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    useActions,
    useActionsEvent,
    useActionsSettings,
    useActionsUiAdapter,
    type ActionContext,
    type ActionOrigin,
    type ActionPolicyDecision,
    type PdfActionTree,
  } from '@embedpdf/svelte/actions';

  // A link to a website, as a PDF carries it: what getActionTree() reads from a link.
  const websiteLink: PdfActionTree = {
    root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  };

  // The three ways an action can start, each as the context it runs with.
  const STARTS: ReadonlyArray<{ label: string; context: ActionContext }> = [
    {
      label: 'A click',
      context: { origin: 'user', source: { kind: 'api' }, event: { scope: 'activate' } },
    },
    {
      label: 'The pointer over it',
      context: {
        origin: 'hover',
        source: { kind: 'api' },
        event: { scope: 'annotation', name: 'cursorEnter' },
      },
    },
    {
      label: 'The document opening',
      context: {
        origin: 'lifecycle',
        source: { kind: 'api' },
        event: { scope: 'document', name: 'open' },
      },
    },
  ];
  const RULES: readonly ActionPolicyDecision[] = ['allow', 'adapter', 'report', 'block'];

  const actions = useActions();
  const rules = useActionsSettings((settings) => settings.policy.uri);
  let log = $state<string[]>([]);
  const note = (line: string) => {
    log = [line, ...log].slice(0, 6);
  };

  // Instead of opening a tab, the adapter notes the website it was given.
  useActionsUiAdapter({ openUri: (uri) => note(`Your adapter got ${uri}`) });
  useActionsEvent(
    (capability) => capability.onDiagnosticReported,
    ({ code, action }) => note(`The ${action} action was not run: ${code}`),
  );

  const run = (context: ActionContext) => actions.execute(websiteLink, context);
  const setRule = (origin: ActionOrigin, rule: ActionPolicyDecision) =>
    actions.updateSettings({ policy: { uri: { [origin]: rule } } });

  // One click on load, so the log shows what a click does.
  onMount(() => {
    void run(STARTS[0].context);
  });
</script>

<section class="panel">
  <ul class="starts">
    {#each STARTS as { label, context } (context.origin)}
      <li class="start">
        <span class="start-label">
          {label} <code>{context.origin}</code>
        </span>
        <select
          class="field"
          aria-label="The rule for {context.origin}"
          value={rules.current[context.origin]}
          onchange={(event) =>
            setRule(context.origin, event.currentTarget.value as ActionPolicyDecision)}
        >
          {#each RULES as rule (rule)}
            <option value={rule}>{rule}</option>
          {/each}
        </select>
        <button type="button" class="button" onclick={() => run(context)}>Run the link</button>
      </li>
    {/each}
  </ul>
  <div class="footer">
    <ol class="log" aria-live="polite">
      {#each log as line, index (log.length - index)}
        <li>{line}</li>
      {/each}
    </ol>
    <button type="button" class="button" onclick={() => actions.resetSettings()}>
      Back to the registered rules
    </button>
  </div>
</section>
