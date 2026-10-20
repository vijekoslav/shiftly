import type { ReactNode } from 'react';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}

/** iOS segmented control. */
export function Segmented<T extends string>({ value, options, onChange, label }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[9px] bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 text-[14px] font-medium transition-colors duration-150 ${
              active ? 'bg-surface-3 text-label shadow-sm' : 'text-label-2'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
