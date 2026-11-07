import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon } from './icons.tsx';

export function IconButton({ icon, label, active, size, className = '', children, ...rest }: {
  icon: string;
  label: string;
  active?: boolean;
  size?: number;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active} {...rest}>
      <Icon name={icon} size={size} />
      {children}
    </button>
  );
}

/** A modal sheet. It holds focus while open, returns it afterwards, and closes on Escape or a backdrop tap. */
export function Sheet({ title, onClose, children, width, footer }: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        // Keep Tab inside the dialog.
        const items = ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]');
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={width ? { maxWidth: width } : undefined}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, action?: Toast['action'], ms?: number) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, action, ms = action ? 7000 : 2600) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, message, action }] });
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
export const toast = (message: string, action?: Toast['action'], ms?: number) => useToasts.getState().show(message, action, ms);

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.action && (
            <button type="button" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'is-active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
