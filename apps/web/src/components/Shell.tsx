import type { ReactNode } from 'react';
import { BarChart3, FileText, Home, Languages, LayoutDashboard, Map as MapIcon, Target } from 'lucide-react';
import { useI18n, type TKey } from '../lib/i18n';
import { href, type Route } from '../lib/router';
import { LogoMark } from './Logo';
import { DemoBadge } from './Ui';

const NAV: { route: Route; key: TKey; icon: typeof Home }[] = [
  { route: 'tableau-de-bord', key: 'navDashboard', icon: LayoutDashboard },
  { route: 'territoires', key: 'navTerritories', icon: MapIcon },
  { route: 'analyses', key: 'navAnalyses', icon: Target },
  { route: 'donnees', key: 'navData', icon: BarChart3 },
  { route: 'rapports', key: 'navReports', icon: FileText },
];
export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const { t, toggle } = useI18n();
  return (
    <div className="flex min-h-full flex-col pb-16 lg:pb-0">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">{t('skip')}</a>
      <header className="no-print flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-4 py-2">
        <a href={href('')} className="flex items-center gap-2 text-lg font-extrabold text-forest no-underline" aria-label="TerriScope"><LogoMark /><span dir="ltr">TerriScope</span></a>
        <span className="hidden text-sm font-semibold text-muted xl:inline">{t('space')}</span>
        <nav aria-label={t('mainNav')} className="hidden flex-1 gap-1 lg:flex">
          {NAV.map((n) => <a key={n.route} href={href(n.route)} aria-current={route === n.route ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm no-underline ${route === n.route ? 'bg-mint font-extrabold text-forest' : 'font-semibold text-night hover:bg-mist'}`}>{t(n.key)}</a>)}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <DemoBadge />
          <button type="button" onClick={toggle} aria-label={t('languageLabel')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-bold text-night"><Languages size={15} aria-hidden="true" />{t('language')}</button>
        </div>
      </header>
      <main id="contenu" className="flex-1">{children}</main>
      <nav aria-label={t('mainNav')} className="no-print fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 bg-night lg:hidden">
        {NAV.map((n) => { const Icon = n.icon; const on = route === n.route; return <a key={n.route} href={href(n.route)} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] no-underline ${on ? 'font-extrabold text-white' : 'font-semibold text-[#c4d0da]'}`}><Icon size={19} aria-hidden="true" /><span className="max-w-full truncate px-0.5">{t(n.key)}</span></a>; })}
      </nav>
    </div>
  );
}
