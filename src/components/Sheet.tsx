import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useEscape } from '../lib/hooks';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Left header action (defaults to Cancel). */
  leading?: ReactNode;
  /** Right header action, e.g. Save. */
  trailing?: ReactNode;
}

/** iOS-style modal sheet: slides up on phones, centred card on larger screens. */
export function Sheet({ title, onClose, children, leading, trailing }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEscape(true, onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const scroller = document.getElementById('main-scroll');
    const prevOverflow = scroller?.style.overflow ?? '';
    if (scroller) scroller.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      if (scroller) scroller.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="anim-fade-in absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="anim-sheet-up relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-bg outline-none sm:max-w-md sm:rounded-[22px] sm:border sm:border-separator"
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-label-3/60 sm:hidden" aria-hidden />
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pb-2 pt-2">
          <div className="justify-self-start">
            {leading ?? (
              <button type="button" onClick={onClose} className="-ml-2 min-h-11 px-2 text-[17px] text-accent">
                Cancel
              </button>
            )}
          </div>
          <h2 id={titleId} className="text-[17px] font-semibold">
            {title}
          </h2>
          <div className="justify-self-end">{trailing}</div>
        </header>
        <div className="scroll-y px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">{children}</div>
      </div>
    </div>
  );
}

export function SheetAction({
  children,
  onClick,
  disabled,
  bold = true,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  bold?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`-mr-2 min-h-11 px-2 text-[17px] text-accent disabled:text-label-3 ${bold ? 'font-semibold' : ''}`}
    >
      {children}
    </button>
  );
}
