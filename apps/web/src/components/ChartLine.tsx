import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export function ChartLine({ labels, values, name, rtl, label }: { labels: string[]; values: number[]; name: string; rtl: boolean; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: 'svg' });
    chart.setOption({
      animation: false, textStyle: { fontFamily: 'inherit' }, grid: { left: 40, right: 16, top: 12, bottom: 24 }, tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${Number(v).toFixed(1)} %` },
      xAxis: { type: 'category', inverse: rtl, data: labels, axisLabel: { color: '#5b6b7a' }, axisLine: { lineStyle: { color: '#9aa8b4' } } },
      yAxis: { type: 'value', position: rtl ? 'right' : 'left', scale: true, axisLabel: { color: '#5b6b7a', formatter: '{value} %' }, splitLine: { lineStyle: { color: '#e6ebef' } } },
      series: [{ type: 'line', name, data: values, smooth: false, symbolSize: 6, lineStyle: { color: '#075b50', width: 3 }, itemStyle: { color: '#075b50' }, areaStyle: { color: '#ddf3ea' } }],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [labels, values, name, rtl]);
  return <div ref={el} role="img" aria-label={label} className="h-44 w-full" />;
}
