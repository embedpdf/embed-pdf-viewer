import { h, ComponentChildren } from 'preact';
interface ToggleButtonProps {
    active?: boolean;
    disabled?: boolean;
    onClick?: () => void;
    title?: string;
    children: ComponentChildren;
    className?: string;
}
/**
 * A toggle button for toolbar-style controls (bold, italic, alignment, etc.)
 */
export declare function ToggleButton({ active, disabled, onClick, title, children, className, }: ToggleButtonProps): h.JSX.Element;
export {};
//# sourceMappingURL=toggle-button.d.ts.map