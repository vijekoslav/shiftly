import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type PointerEvent } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
}

interface Props<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}

// Spring tuned for ~350 ms of perceived motion with a small, quick overshoot.
const STIFFNESS = 300;
const DAMPING = 24;
const REST_DELTA = 0.05;
/** Speed (px/s) at which the indicator is fully "lens-shaped". */
const LENS_SPEED = 700;

interface Spring {
  x: number;
  w: number;
  vx: number;
  vw: number;
  tx: number;
  tw: number;
}

/**
 * Floating pill tab bar. One shared indicator slides to the selected tab on a spring, stretching
 * into a glassy lens while it travels, then settles. Retargeting mid-flight keeps its velocity, so
 * rapid taps redirect the motion instead of restarting it.
 */
export function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  const list = useRef<HTMLUListElement>(null);
  const items = useRef(new Map<T, HTMLLIElement>());
  const indicator = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  const frame = useRef(0);
  const last = useRef(0);
  const reduceMotion = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  /** Tab currently under the indicator while the user drags it; null otherwise. */
  const [preview, setPreview] = useState<T | null>(null);
  const dragging = useRef(false);
  const drag = useRef<{ startX: number; grab: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);

  const paint = (s: Spring) => {
    const el = indicator.current;
    if (!el) return;
    const speed = Math.abs(s.vx) + Math.abs(s.vw) * 0.5;
    const lens = dragging.current ? 1 : Math.min(1, speed / LENS_SPEED);
    el.style.width = `${s.w}px`;
    el.style.transform = `translate3d(${s.x}px,0,0) scale(${1 + 0.1 * lens},${1 + 0.24 * lens})`;
    if (glass.current) glass.current.style.opacity = String(lens);
  };

  const step = (now: number) => {
    const s = spring.current;
    if (!s) return;
    // Fixed sub-steps keep the integration stable even after a dropped frame.
    let dt = Math.min((now - last.current) / 1000, 1 / 20);
    last.current = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      s.vx += (STIFFNESS * (s.tx - s.x) - DAMPING * s.vx) * h;
      s.vw += (STIFFNESS * (s.tw - s.w) - DAMPING * s.vw) * h;
      s.x += s.vx * h;
      s.w += s.vw * h;
      dt -= h;
    }
    const settled =
      Math.abs(s.tx - s.x) < REST_DELTA && Math.abs(s.tw - s.w) < REST_DELTA && Math.abs(s.vx) < 1 && Math.abs(s.vw) < 1;
    if (settled) {
      s.x = s.tx;
      s.w = s.tw;
      s.vx = s.vw = 0;
      paint(s);
      frame.current = 0;
      return;
    }
    paint(s);
    frame.current = requestAnimationFrame(step);
  };

  const measure = () => {
    const el = items.current.get(activeRef.current);
    return el ? { x: el.offsetLeft, w: el.offsetWidth } : null;
  };

  const retarget = (animate: boolean) => {
    const target = measure();
    if (!target) return;
    const s = spring.current;
    if (!s || !animate || reduceMotion.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      spring.current = { x: target.x, w: target.w, vx: 0, vw: 0, tx: target.x, tw: target.w };
      paint(spring.current);
      if (indicator.current) indicator.current.style.opacity = '1';
      return;
    }
    s.tx = target.x;
    s.tw = target.w;
    if (!frame.current) {
      last.current = performance.now();
      frame.current = requestAnimationFrame(step);
    }
  };

  // Selection changed: animate. First run: place the indicator without animating.
  useLayoutEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    retarget(spring.current !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Layout changed (rotation, font load, window resize): snap to the new geometry.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const ro = new ResizeObserver(() => retarget(false));
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
    // Subscribe once: a fresh observer fires immediately and would snap the indicator mid-slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureRunning = () => {
    if (frame.current) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(step);
  };

  /** Pointer x relative to the list's padding box, the coordinate space of the indicator. */
  const relX = (clientX: number) => {
    const ul = list.current;
    return ul ? clientX - ul.getBoundingClientRect().left - ul.clientLeft : 0;
  };

  const nearestTab = (centerX: number): T => {
    let best = tabs[0].id;
    let bestDistance = Infinity;
    for (const t of tabs) {
      const el = items.current.get(t.id);
      if (!el) continue;
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centerX);
      if (d < bestDistance) {
        bestDistance = d;
        best = t.id;
      }
    }
    return best;
  };

  // Press and slide: the indicator follows the finger (still springy), the tab under it is
  // previewed, and the selection is committed on release.
  const onPointerDown = (e: PointerEvent) => {
    const s = spring.current;
    if (!s || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const x = relX(e.clientX);
    const onIndicator = x >= s.x && x <= s.x + s.w;
    drag.current = { startX: e.clientX, grab: onIndicator ? x - s.x : s.w / 2, moved: false, pointerId: e.pointerId };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const s = spring.current;
    if (!d || !s) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 6) return; // still a tap
      d.moved = true;
      dragging.current = true;
      list.current?.setPointerCapture(d.pointerId);
    }
    const first = items.current.get(tabs[0].id);
    const lastTab = items.current.get(tabs[tabs.length - 1].id);
    if (!first || !lastTab) return;
    const minX = first.offsetLeft;
    const maxX = lastTab.offsetLeft + lastTab.offsetWidth - s.w;
    s.tx = Math.min(maxX, Math.max(minX, relX(e.clientX) - d.grab));
    ensureRunning();
    const id = nearestTab(s.tx + s.w / 2);
    setPreview((prev) => (prev === id ? prev : id));
  };

  const endDrag = (cancelled: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    dragging.current = false;
    // The browser still sends a click after the drag; swallow it so it doesn't select a tab twice.
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    const s = spring.current;
    const id = cancelled || !s ? activeRef.current : nearestTab(s.tx + s.w / 2);
    setPreview(null);
    if (id !== activeRef.current) onChange(id);
    else retarget(true);
  };

  const shown = preview ?? active;

  return (
    <nav aria-label="Primary" className="z-40 shrink-0 touch-none px-3 pb-2 pt-1">
      <ul
        ref={list}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(false)}
        onPointerCancel={() => endDrag(true)}
        onClickCapture={(e) => {
          if (suppressClick.current) e.stopPropagation();
        }}
        className="relative mx-auto flex max-w-md select-none rounded-full border border-separator bg-surface/90 p-1 backdrop-blur-xl"
      >
        <div
          ref={indicator}
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 w-0 rounded-full opacity-0 will-change-transform"
        >
          <div className="absolute inset-0 rounded-full bg-label/10" />
          {/* Glass lens, visible only while the indicator is moving. */}
          <div
            ref={glass}
            className="absolute inset-0 rounded-full bg-label/10 opacity-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_4px_14px_rgba(0,0,0,0.35)] backdrop-blur-[3px]"
          />
        </div>
        {tabs.map(({ id, label, icon: Icon }) => {
          const selected = shown === id;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) items.current.set(id, el);
                else items.current.delete(id);
              }}
              className="relative flex-1"
            >
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active === id ? 'page' : undefined}
                className={`flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors duration-300 ${
                  selected ? 'text-accent' : 'text-label-2'
                }`}
              >
                <Icon size={24} strokeWidth={selected ? 2.3 : 1.9} aria-hidden />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
