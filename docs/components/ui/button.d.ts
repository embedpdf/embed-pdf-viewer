import { h, ComponentChildren, JSX } from 'preact';
type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    id?: string;
    children: ComponentChildren;
    onClick?: h.JSX.MouseEventHandler<HTMLButtonElement> | undefined;
    active?: boolean;
    disabled?: boolean;
    className?: string;
    tooltip?: string;
    elementRef?: (el: HTMLButtonElement | null) => void;
};
export declare function Button({ id, children, onClick, active, disabled, className, tooltip, elementRef, ...props }: ButtonProps): h.JSX.Element;
export {};
//# sourceMappingURL=button.d.ts.map