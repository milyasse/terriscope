import { Component, lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { I18nProvider, useI18n } from './lib/i18n';
import { useRoute, href } from './lib/router';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Territories = lazy(() => import('./pages/Territories'));
const Analyses = lazy(() => import('./pages/Analyses'));
const DataPage = lazy(() => import('./pages/DataPage'));
const Reports = lazy(() => import('./pages/Reports'));

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function Message({ text, action, to }: { text: string; action: string; to?: string }) {
  return <div className="mx-auto max-w-xl p-10 text-center"><p className="text-lg font-bold">{text}</p><a className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-forest px-4 font-extrabold text-white no-underline" href={to ?? '#/'} onClick={to ? undefined : () => window.location.reload()}>{action}</a></div>;
}
function App() {
  const route = useRoute();
  const { t } = useI18n();
  if (route === '') return <Home />;
  const pages: Record<string, ReactNode> = { 'tableau-de-bord': <Dashboard />, territoires: <Territories />, analyses: <Analyses />, donnees: <DataPage />, rapports: <Reports /> };
  return (
    <Shell route={route}>
      <Boundary key={route} fallback={<Message text={t('error')} action={t('reload')} />}>
        <Suspense fallback={<p role="status" className="p-8 font-semibold text-muted">{t('loading')}</p>}>
          {pages[route] ?? <Message text={t('notFound')} action={t('backHome')} to={href('')} />}
        </Suspense>
      </Boundary>
    </Shell>
  );
}
createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>);
