import { Card, Note } from '../components/Ui';
import { DEMO_DATE, dataset } from '../lib/demo';
import { useI18n } from '../lib/i18n';

export default function DataPage() {
  const { t, num } = useI18n();
  const th = 'p-3 text-start text-xs font-bold text-muted';
  return <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-5">
    <div><h1 className="m-0 text-2xl font-extrabold">{t('dataTitle')}</h1><p className="m-0 mt-1 font-semibold text-muted">{t('dataIntro')}</p></div>
    <Card className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-sm"><thead><tr className="bg-mist"><th className={th}>{t('datasetName')}</th><th className={th}>{t('source')}</th><th className={th}>{t('records')}</th><th className={th}>{t('updated')}</th></tr></thead><tbody><tr className="border-t border-[#e6ebef]"><td className="p-3 font-extrabold">{t('datasetDemo')}</td><td className="p-3">{t('sourceDemo')}</td><td className="p-3">{num(dataset.cells.length + dataset.services.length + dataset.candidates.length)}</td><td className="p-3" dir="ltr">{DEMO_DATE}</td></tr></tbody></table></Card>
    <section><h2 className="m-0 mb-2 text-lg font-extrabold">{t('importTitle')}</h2><Note>{t('importSoon')}</Note></section>
  </div>;
}
