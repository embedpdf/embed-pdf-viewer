import { h } from 'preact';
type CommandButtonProps = {
    commandId: string;
    documentId: string;
    variant?: 'icon' | 'text' | 'icon-text' | 'tab';
    itemId?: string;
    className?: string;
};
/**
 * A button that executes a command when clicked.
 * Uses the useCommand hook to get the command state and execution function.
 */
export declare function CommandButton({ commandId, documentId, variant, itemId, className, }: CommandButtonProps): h.JSX.Element | null;
export {};
//# sourceMappingURL=command-button.d.ts.map