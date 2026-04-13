<script lang="ts">
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import {
    useSignatureCapability,
    useSignatureUpload,
    SignatureDrawPad,
    SignatureTypePad,
    SignatureMode,
  } from '@embedpdf/plugin-signature/svelte';
  import type { SignatureFieldDefinition } from '@embedpdf/plugin-signature/svelte';
  import Dialog from './ui/Dialog.svelte';

  const SIGNATURE_FONTS_URL =
    'https://fonts.googleapis.com/css2?family=Caveat&family=Dancing+Script&family=Great+Vibes&family=Pacifico&display=swap';

  function ensureSignatureFonts() {
    if (document.querySelector(`link[href="${SIGNATURE_FONTS_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SIGNATURE_FONTS_URL;
    document.head.appendChild(link);
  }

  interface Props {
    documentId: string;
    isOpen?: boolean;
    onClose?: () => void;
    onExited?: () => void;
  }

  type CreationTab = 'draw' | 'type' | 'upload';

  interface FieldResult {
    field: SignatureFieldDefinition;
  }

  const FONTS = [
    { name: 'Dancing Script', family: "'Dancing Script', cursive" },
    { name: 'Great Vibes', family: "'Great Vibes', cursive" },
    { name: 'Pacifico', family: "'Pacifico', cursive" },
    { name: 'Caveat', family: "'Caveat', cursive" },
  ];

  const COLORS = [
    { name: 'Black', value: '#000000' },
    { name: 'Blue', value: '#597ce2' },
    { name: 'Red', value: '#e44234' },
  ];

  let { documentId, isOpen = false, onClose, onExited }: Props = $props();

  const { translate } = useTranslations(() => documentId);
  const signatureCapability = useSignatureCapability();

  const mode = $derived(signatureCapability.provides?.mode ?? SignatureMode.SignatureOnly);
  const needsInitials = $derived(mode === SignatureMode.SignatureAndInitials);

  let activeTab = $state<CreationTab>('draw');
  let selectedFont = $state(FONTS[0].family);
  let selectedColor = $state(COLORS[0].value);
  let sigResult = $state<FieldResult | null>(null);
  let iniResult = $state<FieldResult | null>(null);

  let sigDrawPad: { clear(): void } | undefined = $state();
  let iniDrawPad: { clear(): void } | undefined = $state();
  let sigTypePad: { clear(): void } | undefined = $state();
  let iniTypePad: { clear(): void } | undefined = $state();

  $effect(() => {
    if (isOpen) ensureSignatureFonts();
  });

  function handleSigResult(result: SignatureFieldDefinition | null) {
    sigResult = result ? { field: result } : null;
  }

  function handleIniResult(result: SignatureFieldDefinition | null) {
    iniResult = result ? { field: result } : null;
  }

  const sigUpload = useSignatureUpload({ onResult: handleSigResult });
  const iniUpload = useSignatureUpload({ onResult: handleIniResult });

  function clearAll() {
    sigDrawPad?.clear();
    iniDrawPad?.clear();
    sigTypePad?.clear();
    iniTypePad?.clear();
    sigUpload.clear();
    iniUpload.clear();
    sigResult = null;
    iniResult = null;
  }

  function resetState() {
    activeTab = 'draw';
    selectedFont = FONTS[0].family;
    selectedColor = COLORS[0].value;
    clearAll();
  }

  function handleTabChange(tab: CreationTab) {
    clearAll();
    activeTab = tab;
  }

  function handleSave() {
    if (!sigResult || !signatureCapability.provides) return;

    signatureCapability.provides.addEntry({
      signature: sigResult.field,
      ...(iniResult && { initials: iniResult.field }),
    });

    resetState();
    onClose?.();
  }

  function handleClose() {
    resetState();
    onClose?.();
  }

  const canSave = $derived(sigResult && (!needsInitials || iniResult));

  const tabs: Array<{ id: CreationTab; labelKey: string; fallback: string }> = [
    { id: 'draw', labelKey: 'signature.create.draw', fallback: 'Draw' },
    { id: 'type', labelKey: 'signature.create.type', fallback: 'Type' },
    { id: 'upload', labelKey: 'signature.create.upload', fallback: 'Upload' },
  ];

  const padHeight = 140;

  let sigFileInput: HTMLInputElement | undefined = $state();
  let iniFileInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (sigFileInput) sigUpload.inputRef.current = sigFileInput;
  });

  $effect(() => {
    if (iniFileInput) iniUpload.inputRef.current = iniFileInput;
  });
</script>

<Dialog
  open={isOpen}
  title={translate('signature.create.title', { fallback: 'Create Signature' })}
  onClose={handleClose}
  class={needsInitials ? 'md:!w-[42rem]' : ''}
  maxWidth={needsInitials ? '42rem' : '32rem'}
>
  <div class="flex flex-col gap-4">
    <!-- Tab selector -->
    <div class="flex gap-1 border-b border-gray-200">
      {#each tabs as tab (tab.id)}
        <button
          class="px-4 py-2 text-sm font-medium transition-colors {activeTab === tab.id
            ? 'border-b-2 border-blue-600 text-blue-600'
            : 'text-gray-400 hover:text-gray-900'}"
          onclick={() => handleTabChange(tab.id)}
        >
          {translate(tab.labelKey, { fallback: tab.fallback })}
        </button>
      {/each}
    </div>

    <!-- Pads -->
    <div class="flex gap-4">
      <!-- Signature pad -->
      <div class="flex {needsInitials ? 'flex-[2]' : 'flex-1'} flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-500">
            {translate('signature.create.signatureLabel', { fallback: 'Signature' })}
          </span>
          <button
            class="text-xs text-gray-400 underline hover:text-gray-900"
            onclick={() => {
              if (activeTab === 'draw') sigDrawPad?.clear();
              else if (activeTab === 'type') sigTypePad?.clear();
              else sigUpload.clear();
            }}
          >
            {translate('signature.create.clear', { fallback: 'Clear' })}
          </button>
        </div>

        <div style="height: {padHeight}px">
          {#if activeTab === 'draw'}
            <SignatureDrawPad
              bind:this={sigDrawPad}
              onResult={handleSigResult}
              strokeColor={selectedColor}
              class="rounded border border-gray-200"
            />
          {:else if activeTab === 'type'}
            <SignatureTypePad
              bind:this={sigTypePad}
              onResult={handleSigResult}
              fontFamily={selectedFont}
              color={selectedColor}
              class="rounded border border-gray-200 px-3 py-2"
              placeholder={translate('signature.create.typePlaceholder', {
                fallback: 'e.g. John Smith',
              })}
            />
          {:else}
            <input
              bind:this={sigFileInput}
              type="file"
              accept={sigUpload.accept}
              onchange={sigUpload.handleFileInputChange}
              style="display: none"
            />
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={sigUpload.openFilePicker}
              ondrop={sigUpload.handleDrop}
              ondragover={sigUpload.handleDragOver}
              ondragleave={sigUpload.handleDragLeave}
              class="flex w-full cursor-pointer items-center justify-center rounded border-2 border-dashed transition-colors {sigUpload.isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-400'}"
              style="height: {padHeight}px"
            >
              {#if sigUpload.previewUrl}
                <img
                  src={sigUpload.previewUrl}
                  style="max-width: 90%; max-height: 90%; object-fit: contain"
                  alt="Upload preview"
                />
              {:else}
                <span class="px-4 text-center text-xs text-gray-400">
                  {translate('signature.create.uploadPlaceholder', {
                    fallback: 'Click or drag an image here',
                  })}
                </span>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Initials pad -->
      {#if needsInitials}
        <div class="flex flex-1 flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">
              {translate('signature.create.initialsLabel', { fallback: 'Initials' })}
            </span>
            <button
              class="text-xs text-gray-400 underline hover:text-gray-900"
              onclick={() => {
                if (activeTab === 'draw') iniDrawPad?.clear();
                else if (activeTab === 'type') iniTypePad?.clear();
                else iniUpload.clear();
              }}
            >
              {translate('signature.create.clear', { fallback: 'Clear' })}
            </button>
          </div>

          <div style="height: {padHeight}px">
            {#if activeTab === 'draw'}
              <SignatureDrawPad
                bind:this={iniDrawPad}
                onResult={handleIniResult}
                strokeColor={selectedColor}
                class="rounded border border-gray-200"
              />
            {:else if activeTab === 'type'}
              <SignatureTypePad
                bind:this={iniTypePad}
                onResult={handleIniResult}
                fontFamily={selectedFont}
                color={selectedColor}
                class="rounded border border-gray-200 px-3 py-2"
                placeholder={translate('signature.create.initialsPlaceholder', {
                  fallback: 'e.g. JS',
                })}
              />
            {:else}
              <input
                bind:this={iniFileInput}
                type="file"
                accept={iniUpload.accept}
                onchange={iniUpload.handleFileInputChange}
                style="display: none"
              />
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                onclick={iniUpload.openFilePicker}
                ondrop={iniUpload.handleDrop}
                ondragover={iniUpload.handleDragOver}
                ondragleave={iniUpload.handleDragLeave}
                class="flex w-full cursor-pointer items-center justify-center rounded border-2 border-dashed transition-colors {iniUpload.isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-400'}"
                style="height: {padHeight}px"
              >
                {#if iniUpload.previewUrl}
                  <img
                    src={iniUpload.previewUrl}
                    style="max-width: 90%; max-height: 90%; object-fit: contain"
                    alt="Upload preview"
                  />
                {:else}
                  <span class="px-4 text-center text-xs text-gray-400">
                    {translate('signature.create.uploadPlaceholder', {
                      fallback: 'Click or drag an image here',
                    })}
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Controls: font selector + color picker -->
    {#if activeTab === 'draw' || activeTab === 'type'}
      <div class="flex items-center gap-4">
        {#if activeTab === 'type'}
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-500">
              {translate('signature.create.font', { fallback: 'Font' })}
            </label>
            <select
              class="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900"
              value={selectedFont}
              onchange={(e) => {
                selectedFont = (e.target as HTMLSelectElement).value;
              }}
            >
              {#each FONTS as f (f.family)}
                <option value={f.family} style="font-family: {f.family}">
                  {f.name}
                </option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">
            {translate('signature.create.color', { fallback: 'Color' })}
          </label>
          <div class="flex gap-1.5">
            {#each COLORS as c (c.value)}
              <button
                title={c.name}
                class="h-6 w-6 rounded-full border-2 transition-all {selectedColor === c.value
                  ? 'scale-110 border-blue-500'
                  : 'border-gray-200 hover:scale-105'}"
                style="background-color: {c.value}"
                onclick={() => (selectedColor = c.value)}
              ></button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex justify-end gap-2">
      <button
        class="rounded-md px-3 py-1.5 text-sm text-gray-400 transition-colors hover:text-gray-900"
        onclick={handleClose}
      >
        {translate('signature.create.cancel', { fallback: 'Cancel' })}
      </button>
      <button
        class="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canSave}
        onclick={handleSave}
      >
        {translate('signature.create.save', { fallback: 'Save' })}
      </button>
    </div>
  </div>
</Dialog>
