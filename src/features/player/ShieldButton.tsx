import { memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cdBtn } from './cdBtn';

/**
 * CD-player style button with raised 3D border.
 * active: highlighted state.
 */
interface ShieldButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** When true, the button is in the "active/on" state with a subtle highlight. */
  active?: boolean;
}

const ShieldButtonInner = ({ children, className = '', active = false, ...props }: ShieldButtonProps) => {
  return (
    <button
      className={`${cdBtn} inline-flex items-center justify-center gap-1 rounded ${
        active
          ? 'bg-purple-900/60 text-purple-200 border-t-purple-400 border-l-purple-400 border-b-purple-950 border-r-purple-950 hover:bg-purple-800/60'
          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const ShieldButton = memo(ShieldButtonInner);
