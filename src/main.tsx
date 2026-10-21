import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { UIProvider } from './components/UIProvider';
import { initPWA } from './lib/pwa';
import { AppProvider } from './state/AppProvider';
import { t } from './i18n';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Shiftly crashed', error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-[22px] font-semibold">{t('app.crashTitle')}</h1>
        <p className="max-w-xs text-[15px] text-label-2">
          {t('app.crashBody')}
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="min-h-12 rounded-xl bg-accent px-6 text-[17px] font-semibold text-white"
        >
          {t('app.reload')}
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <UIProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </UIProvider>
    </ErrorBoundary>
  </StrictMode>,
);

initPWA();
