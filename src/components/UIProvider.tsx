import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEscape } from '../lib/hooks';
import { t } from '../i18n';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Hide the cancel button (an information alert). */
  infoOnly?: boolean;
}

interface UIContextValue {
  toast: (message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextValue | null>(null);

interface ToastItem {
  id: number;
  message: string;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    dialog?.resolve(ok);
    setDialog(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UIContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-60 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-toast-in rounded-full bg-surface-3 px-4 py-2.5 text-[14px] font-medium text-label shadow-lg"
          >
            {t.message}
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog options={dialog} onResult={close} />}
    </UIContext.Provider>
  );
}

function ConfirmDialog({ options, onResult }: { options: ConfirmOptions; onResult: (ok: boolean) => void }) {
  useEscape(true, () => onResult(false));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-8">
      <div className="anim-fade-in absolute inset-0 bg-black/60" onClick={() => onResult(false)} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={options.title}
        className="anim-pop-in relative w-full max-w-72.5 overflow-hidden rounded-[18px] bg-surface-2 text-center outline-none"
      >
        <div className="px-4 pb-4 pt-5">
          <h2 className="text-[17px] font-semibold">{options.title}</h2>
          {options.message && <p className="mt-1 whitespace-pre-line text-[13px] text-label-2">{options.message}</p>}
        </div>
        <div className="grid border-t border-separator" style={{ gridTemplateColumns: options.infoOnly ? '1fr' : '1fr 1fr' }}>
          {!options.infoOnly && (
            <button type="button" onClick={() => onResult(false)} className="min-h-11 border-r border-separator text-[17px] text-accent">
              {t('common.cancel')}
            </button>
          )}
          <button type="button" onClick={() => onResult(true)} className="min-h-11 text-[17px] font-semibold text-accent">
            {options.confirmLabel ?? t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}
