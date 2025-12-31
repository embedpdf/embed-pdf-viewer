import { h, ComponentChildren, JSX } from 'preact';
type TabButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ComponentChildren;
    onClick?: h.JSX.MouseEventHandler<HTMLButtonElement> | undefined;
    active?: boolean;
    disabled?: boolean;
    className?: string;
    anchorRef?: (el: HTMLButtonElement | null) => void;
};
export declare function TabButton({ children, onClick, active, disabled, className, anchorRef, ...props }: TabButtonProps): h.JSX.Element;
export {};
//# sourceMappingURL=tab-button.d.ts.map