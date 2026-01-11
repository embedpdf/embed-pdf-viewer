import { h } from 'preact';
import { PdfPermissionFlag } from '@embedpdf/models';
import { Icon } from './ui/icon';

interface PermissionsDisplayProps {
  permissions: number;
  translate: (key: string) => string;
  label?: string;
}

interface PermissionOption {
  flag: PdfPermissionFlag;
  labelKey: string;
}

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

export function PermissionsDisplay({ permissions, translate, label }: PermissionsDisplayProps) {
  const hasPermission = (flag: PdfPermissionFlag): boolean => {
    return (permissions & flag) !== 0;
  };

  return (
    <div>
      <label className="text-fg-secondary mb-2 block text-sm font-medium">
        {label ?? translate('security.viewPermissions.restrictedActions')}
      </label>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {PERMISSION_OPTIONS.map((option) => {
          const allowed = hasPermission(option.flag);
          return (
            <div
              key={option.flag}
              className={`flex items-center rounded-md p-2 ${
                allowed ? 'text-fg-primary' : 'text-fg-muted'
              }`}
            >
              <Icon
                icon={allowed ? 'check' : 'x'}
                className={`mr-2 h-4 w-4 flex-shrink-0 ${
                  allowed ? 'text-state-success' : 'text-state-error'
                }`}
              />
              <span className="text-sm">{translate(option.labelKey)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { PERMISSION_OPTIONS };
export type { PermissionOption };
