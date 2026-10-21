import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CalendarRange, Settings, WifiOff } from 'lucide-react';
import { monthOf, startOfWeek } from './engine/dates';
import type { DateKey, MonthKey, Shift } from './engine/types';
import { EditDaySheet } from './components/EditDaySheet';
import { ShiftDetailsSheet } from './components/ShiftDetailsSheet';
import { TabBar } from './components/TabBar';
import { useUI } from './components/UIProvider';
import { useOnline } from './lib/hooks';
import { t, useLanguage } from './i18n';
import { applyUpdate, dismissOfflineReady, dismissUpdate, usePWAState } from './lib/pwa';
import { useApp } from './state/AppProvider';
import { MonthView } from './views/MonthView';
import { SettingsView } from './views/SettingsView';
import { WeekView } from './views/WeekView';

type Tab = 'month' | 'week' | 'settings';

const getTabs = (): { id: Tab; label: string; icon: typeof CalendarDays }[] => [
  { id: 'month', label: t('tab.month'), icon: CalendarDays },
  { id: 'week', label: t('tab.week'), icon: CalendarRange },
  { id: 'settings', label: t('tab.settings'), icon: Settings },
];

export default function App() {
  const { today, data, onSaveError } = useApp();
  const { toast } = useUI();
  const [tab, setTab] = useState<Tab>('month');
  const [month, setMonth] = useState<MonthKey>(() => monthOf(today));
  const [selected, setSelected] = useState<DateKey>(today);
  const [weekStart, setWeekStart] = useState<DateKey>(() => startOfWeek(today));
  const [editDate, setEditDate] = useState<DateKey | null>(null);
  const [shiftDetails, setShiftDetails] = useState<Shift | null>(null);
  const scroller = useRef<HTMLElement>(null);
  // Subscribing here re-renders the whole tree when the language changes.
  useLanguage();
  const tabs = getTabs();

  useTheme(data.settings.theme);
  useConnectivityToasts(toast);
  const { offlineReady } = usePWAState();
  useEffect(() => {
    if (!offlineReady) return;
    toast(t('app.readyOffline'));
    dismissOfflineReady();
  }, [offlineReady, toast]);
  useEffect(() => onSaveError(toast), [onSaveError, toast]);

  // Both views follow the selected date, so jumping between them stays in context.
  const selectDate = (date: DateKey) => {
    setSelected(date);
    setWeekStart(startOfWeek(date));
  };

  const changeTab = (next: Tab) => {
    if (next === tab) scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setTab(next);
  };

  return (
    <div className="fixed inset-0 mx-auto flex max-w-[1100px] flex-col bg-bg">
      <main
        ref={scroller}
        id="main-scroll"
        className="scroll-y flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]"
        aria-label={tabs.find((x) => x.id === tab)?.label}
      >
        <StatusBanners />
        <div hidden={tab !== 'month'}>
          <MonthView
            month={month}
            onMonthChange={setMonth}
            selectedDate={selected}
            onSelectDate={selectDate}
            onEditDate={setEditDate}
          />
        </div>
        <div hidden={tab !== 'week'} className={tab === 'week' ? 'flex flex-1 flex-col' : ''}>
          <WeekView weekStart={weekStart} onWeekChange={setWeekStart} onOpenShift={setShiftDetails} />
        </div>
        {tab === 'settings' && <SettingsView />}
      </main>

      <TabBar tabs={tabs} active={tab} onChange={changeTab} />

      {editDate && <EditDaySheet date={editDate} onClose={() => setEditDate(null)} />}
      {shiftDetails && (
        <ShiftDetailsSheet
          shift={shiftDetails}
          onClose={() => setShiftDetails(null)}
          onEdit={() => {
            setEditDate(shiftDetails.date);
            setShiftDetails(null);
          }}
        />
      )}
    </div>
  );
}

function StatusBanners() {
  const online = useOnline();
  const pwa = usePWAState();
  return (
    <div className="empty:hidden">
      {!online && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-[13px] text-label-2" role="status">
          <WifiOff size={15} aria-hidden />
          {t('app.offline')}
        </div>
      )}
      {pwa.needRefresh && (
        <div className="anim-pop-in mx-3 mt-2 flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-2.5 text-[14px]" role="status">
          <span>{t('app.updateReady')}</span>
          <span className="flex shrink-0 items-center">
            <button type="button" onClick={dismissUpdate} className="min-h-11 px-2 text-label-2">
              {t('common.later')}
            </button>
            <button type="button" onClick={() => void applyUpdate()} className="min-h-11 px-2 font-semibold text-accent">
              {t('common.update')}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Applies the chosen appearance to the document and keeps the status-bar colour in step. */
function useTheme(preference: 'system' | 'dark' | 'light') {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && query.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7');
    };
    apply();
    try {
      localStorage.setItem('shiftly-theme', preference);
    } catch {
      // Only a flash-prevention mirror; ignoring is safe.
    }
    if (preference !== 'system') return;
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [preference]);
}

function useConnectivityToasts(toast: (message: string) => void) {
  const online = useOnline();
  const previous = useRef(online);
  useEffect(() => {
    if (previous.current === online) return;
    previous.current = online;
    toast(online ? t('app.backOnline') : t('app.nowOffline'));
  }, [online, toast]);
}
