import { h } from 'preact';
import { DocumentState } from '@embedpdf/core';
export type TabBarVisibility = 'always' | 'multiple' | 'never';
interface TabBarProps {
    documentStates: DocumentState[];
    activeDocumentId: string | null;
    /** When to show the tab bar */
    visibility?: TabBarVisibility;
    /** Allow opening new files via the + button */
    allowOpenFile?: boolean;
}
export declare function TabBar({ documentStates, activeDocumentId, visibility, allowOpenFile, }: TabBarProps): h.JSX.Element | null;
export {};
//# sourceMappingURL=tab-bar.d.ts.map