import { communesOf, provincesOf, REGIONS, type Filters } from '../lib/demo';
import { useI18n } from '../lib/i18n';
import { Select } from './Ui';

export function GlobalFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const { t, regionName } = useI18n();
  const opt = (a: string[]) => [{ value: '', label: t('all') }, ...a.map((x) => ({ value: x, label: x }))];
  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap" role="group" aria-label={t('filters')}>
      <Select label={t('region')} value={value.region} onChange={(region) => onChange({ region, province: '', commune: '' })} options={[{ value: '', label: t('all') }, ...REGIONS.map((r) => ({ value: r.id, label: regionName(r) }))]} />
      <Select label={t('province')} value={value.province} onChange={(province) => onChange({ ...value, province, commune: '' })} options={opt(provincesOf(value.region))} />
      <Select label={t('commune')} value={value.commune} onChange={(commune) => onChange({ ...value, commune })} options={opt(communesOf(value.region, value.province))} />
      <Select label={t('period')} value="2026" disabled options={[{ value: '2026', label: '2026' }]} />
      <Select label={t('sector')} value="food" disabled options={[{ value: 'food', label: t('sectorValue') }]} className="col-span-2 md:col-span-1" />
    </div>
  );
}
