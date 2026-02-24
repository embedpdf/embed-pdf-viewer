<script lang="ts">
  import { PdfPermissionFlag } from '@embedpdf/models';
  import { CheckIcon, CloseIcon } from './icons';

  interface PermissionOption {
    flag: PdfPermissionFlag;
    labelKey: string;
  }

  interface PermissionsDisplayProps {
    permissions: number;
    translate: (key: string, options?: { fallback?: string }) => string;
    label?: string;
  }

  let { permissions, translate, label }: PermissionsDisplayProps = $props();

  const PERMISSION_OPTIONS: PermissionOption[] = [
    { flag: PdfPermissionFlag.Print, labelKey: 'protect.permissions.print' },
    { flag: PdfPermissionFlag.PrintHighQuality, labelKey: 'protect.permissions.printHighQuality' },
    { flag: PdfPermissionFlag.CopyContents, labelKey: 'protect.permissions.copy' },
    {
      flag: PdfPermissionFlag.ExtractForAccessibility,
      labelKey: 'protect.permissions.accessibility',
    },
    { flag: PdfPermissionFlag.ModifyContents, labelKey: 'protect.permissions.modify' },
    { flag: PdfPermissionFlag.ModifyAnnotations, labelKey: 'protect.permissions.annotations' },
    { flag: PdfPermissionFlag.FillForms, labelKey: 'protect.permissions.fillForms' },
    { flag: PdfPermissionFlag.AssembleDocument, labelKey: 'protect.permissions.assemble' },
  ];

  const hasPermission = (flag: PdfPermissionFlag): boolean => {
    return (permissions & flag) !== 0;
  };
</script>

<div>
  <div class="mb-2 block text-sm font-medium text-gray-700">
    {label ??
      translate('security.viewPermissions.restrictedActions', { fallback: 'Document Permissions' })}
  </div>
  <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
    {#each PERMISSION_OPTIONS as option (option.flag)}
      {@const allowed = hasPermission(option.flag)}
      <div class="flex items-center rounded-md p-2 {allowed ? 'text-gray-900' : 'text-gray-400'}">
        {#if allowed}
          <CheckIcon class="mr-2 h-4 w-4 flex-shrink-0 text-green-600" />
        {:else}
          <CloseIcon class="mr-2 h-4 w-4 flex-shrink-0 text-red-500" />
        {/if}
        <span class="text-sm">
          {translate(option.labelKey, { fallback: option.labelKey })}
        </span>
      </div>
    {/each}
  </div>
</div>
