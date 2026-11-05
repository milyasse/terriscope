import { useEffect } from 'react';
import { Languages } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { DemoBadge } from '../components/Ui';
import { useI18n, type TKey } from '../lib/i18n';
import { href } from '../lib/router';

const MODS: [TKey, TKey][] = [['mod1', 'mod1t'], ['mod2', 'mod2t'], ['mod3', 'mod3t'], ['mod4', 'mod4t']];
const PLANS: [string, TKey, TKey][] = [['Free', 'priceTbd', 'planFree'], ['Pro', 'priceTbd', 'planPro'], ['Business', 'priceTbd', 'planBusiness'], ['Enterprise', 'quote', 'planEnterprise']];
export function Home() {
  const { t, toggle } = useI18n();
  useEffect(() => { document.title = 'TerriScope'; }, []);
  return (
    <div>
      <section className="bg-forest text-white">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-4 md:px-8">
          <nav aria-label={t('mainNav')} className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-xl font-extrabold"><span className="rounded-lg bg-white p-1"><LogoMark size={28} /></span><span dir="ltr">TerriScope</span></span>
            <button type="button" onClick={toggle} aria-label={t('languageLabel')} className="ms-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-mint px-3 text-sm font-bold"><Languages size={15} aria-hidden="true" />{t('language')}</button>
            <a href={href('territoires')} className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-extrabold text-forest no-underline">{t('heroCta')}</a>
          </nav>
          <div className="mt-12 flex max-w-3xl flex-col items-start gap-5">
            <DemoBadge />
            <h1 className="m-0 text-4xl font-extrabold leading-tight md:text-6xl">{t('heroTitle')}</h1>
            <p className="m-0 text-lg font-bold text-mint">{t('slogan')}</p>
            <p className="m-0 max-w-2xl text-lg leading-8 text-mint">{t('heroText')}</p>
            <div className="flex flex-wrap gap-2.5">
              <a href={href('territoires')} className="inline-flex min-h-12 items-center rounded-xl bg-white px-5 font-extrabold text-forest no-underline">{t('heroCta')}</a>
              <a href={href('tableau-de-bord')} className="inline-flex min-h-12 items-center rounded-xl border border-mint px-5 font-extrabold text-white no-underline">{t('heroCta2')}</a>
            </div>
            <p className="m-0 text-sm font-semibold text-mint">{t('demoNotice')}</p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-8">
        <h2 className="mb-5 mt-0 text-3xl font-extrabold">{t('modulesTitle')}</h2>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">{MODS.map(([a, b]) => <article key={a} className="rounded-2xl bg-mist p-5"><h3 className="mb-2 mt-0 text-lg font-extrabold">{t(a)}</h3><p className="m-0 leading-6">{t(b)}</p></article>)}</div>
      </section>
      <section className="bg-mist"><div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
        <h2 className="mb-5 mt-0 text-3xl font-extrabold">{t('plansTitle')}</h2>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">{PLANS.map(([n, p, d]) => <article key={n} className="rounded-2xl border border-line bg-white p-5"><h3 className="m-0 text-xl font-extrabold" dir="ltr">{n}</h3><p className="mb-3 mt-1 font-bold text-muted">{t(p)}</p><p className="m-0 leading-6">{t(d)}</p></article>)}</div>
        <p className="mb-0 mt-4 font-semibold">{t('oneOff')}</p><p className="mb-0 mt-1 text-sm font-semibold text-muted">{t('plansNote')}</p>
      </div></section>
      <footer className="bg-night px-4 py-6 text-sm font-semibold text-white md:px-8"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2"><span>{t('slogan')}</span><span>{t('footerDemo')}</span></div></footer>
    </div>
  );
}
