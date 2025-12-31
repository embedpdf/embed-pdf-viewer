import { h, JSX } from 'preact';
import { RedactionItem } from '@embedpdf/plugin-redaction';
type RedactionMenuProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'style'> & {
    item: RedactionItem;
    pageIndex: number;
    style?: JSX.CSSProperties;
};
export declare const RedactionMenu: ({ item, pageIndex, ...props }: RedactionMenuProps) => h.JSX.Element;
export {};
//# sourceMappingURL=redaction-menu.d.ts.map