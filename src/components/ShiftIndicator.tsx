import { Moon, Sun } from 'lucide-react';
import type { DayState } from '../engine/types';
import { STATE_LABEL } from '../lib/format';

interface Props {
  state: DayState;
  size?: number;
  /** Expose a label to screen readers. Pass false when a parent already provides the full label. */
  labelled?: boolean;
  className?: string;
}

/** The calendar glyph for a state: sun, moon, "Zzz", or nothing for a day off. */
export function ShiftIndicator({ state, size = 18, labelled = true, className = '' }: Props) {
  if (state === 'off') return null;
  const a11y = labelled ? { role: 'img' as const, 'aria-label': STATE_LABEL[state] } : { 'aria-hidden': true as const };
  if (state === 'day') {
    return (
      <span className={`inline-flex text-day ${className}`} {...a11y}>
        <Sun size={size} strokeWidth={2.2} fill="currentColor" aria-hidden />
      </span>
    );
  }
  if (state === 'night') {
    return (
      <span className={`inline-flex text-night ${className}`} {...a11y}>
        <Moon size={size} strokeWidth={2.2} fill="currentColor" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center font-semibold leading-none text-rest ${className}`}
      style={{ fontSize: Math.max(10, size * 0.62) }}
      {...a11y}
    >
      Zzz
    </span>
  );
}

export const STATE_TEXT_CLASS: Record<DayState, string> = {
  day: 'text-day',
  night: 'text-night',
  after_night: 'text-rest',
  off: 'text-label-2',
};

export const STATE_TINT_CLASS: Record<DayState, string> = {
  day: 'bg-day/15',
  night: 'bg-night/15',
  after_night: 'bg-rest/15',
  off: 'bg-surface-2',
};
