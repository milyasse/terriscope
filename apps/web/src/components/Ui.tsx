import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`rounded-xl border border-line bg-white ${className}`}>{children}</div>;
export function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'warn' }) {
  return <Card className="p-3.5"><div className="text-[13px] font-semibold text-muted">{label}</div><div className="text-2xl font-extrabold">{value}</div>{note && <div className={`text-xs font-bold ${tone === 'good' ? 'text-forest' : tone === 'warn' ? 'text-rust' : 'text-muted'}`}>{note}</div>}</Card>;
}
export function Select({ label, value, onChange, options, disabled, className = '' }: { label: string; value: string; onChange?: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; className?: string }) {
  return <label className={`flex flex-col gap-0.5 text-xs font-bold text-muted ${className}`}>{label}<select value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} className="h-11 min-w-28 rounded-lg border border-line bg-white px-2 text-[13px] font-bold text-night disabled:bg-mist">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean; title?: string }[]; label: string }) {
  return <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-mist p-1">{options.map((o) => <button key={o.value} type="button" disabled={o.disabled} title={o.title} aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={`min-h-9 rounded-md px-3 text-[13px] font-extrabold ${o.value === value ? 'bg-forest text-white' : o.disabled ? 'text-muted' : 'text-night'}`}>{o.label}</button>)}</div>;
}
export function DemoBadge({ short }: { short?: boolean }) {
  const { t } = useI18n();
  return <span className="whitespace-nowrap rounded-md bg-amber px-2 py-1 text-xs font-extrabold text-night">{t(short ? 'demoShort' : 'demo')}</span>;
}
export const Note = ({ children }: { children: ReactNode }) => <p className="rounded-lg bg-mist p-3 text-[13px] font-semibold leading-5">{children}</p>;
export function Bar({ value, color = 'var(--color-forest)' }: { value: number; color?: string }) {
  return <span className="block h-1.5 rounded bg-[#e6ebef]"><span className="block h-1.5 rounded" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></span>;
}
