'use client';

import { useState } from 'react';
import { experiments } from '../../lib/webmcp-experiments';
import type { SiteLocale } from '../../lib/locale';
import styles from './experiments.module.css';

export function ExperimentExplorer({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  const [selected, setSelected] = useState(0);
  const [metric, setMetric] = useState<'seconds' | 'tokens'>('seconds');
  const item = experiments[selected];
  const max = Math.max(item.baseline[metric], item.webmcp[metric]);
  const change = (item.webmcp[metric] / item.baseline[metric] - 1) * 100;
  const baseline = selected === 2 ? 'Computer Use' : (zh ? '普通浏览器' : 'General browser');
  const format = (value: number) => metric === 'seconds' ? `${value.toFixed(3)} ${zh ? '秒' : 's'}` : new Intl.NumberFormat('en-US').format(value);
  return <div className={styles.explorer}>
    <div className={styles.explorerControls}>
      <div className={styles.switches} role="group" aria-label={zh ? '选择实验' : 'Select experiment'}>
        {experiments.map((experiment, i) => <button key={experiment.id} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><span>0{i + 1}</span> {experiment.name}</button>)}
      </div>
      <div className={styles.metricSwitch} role="group" aria-label={zh ? '选择指标' : 'Select metric'}>
        <button type="button" aria-pressed={metric === 'seconds'} onClick={() => setMetric('seconds')}>{zh ? '耗时' : 'Time'}</button>
        <button type="button" aria-pressed={metric === 'tokens'} onClick={() => setMetric('tokens')}>Token</button>
      </div>
    </div>
    <div className={styles.chartBody} aria-live="polite" aria-atomic="true">
      <div className={styles.chartHeading}>
        <div><p className={styles.mono}>{zh ? '每轮中位数 · 数值越低越少' : 'MEDIAN PER RUN · LOWER IS LESS'}</p><h3>{item.name}</h3></div>
        <div className={styles.chartDelta}>{selected === 2 ? <><strong>0/3 → 3/3</strong><span>{zh ? '完整交付，先看质量' : 'Complete delivery comes first'}</span></> : <><strong>{change > 0 ? '+' : '−'}{Math.abs(change).toFixed(1)}%</strong><span>{metric === 'seconds' ? (zh ? 'WebMCP 耗时变化' : 'WebMCP elapsed time change') : (zh ? 'WebMCP 总 Token 变化' : 'WebMCP total token change')}</span></>}</div>
      </div>
      <div className={styles.bars}>
        {([['baseline', baseline], ['webmcp', 'WebMCP']] as const).map(([key, label]) => <div className={styles.barRow} key={key}>
          <div className={styles.barLabel}><span><i className={key === 'webmcp' ? styles.greenDot : styles.grayDot} />{label}</span><strong>{format(item[key][metric])}</strong></div>
          <div className={styles.barTrack} aria-hidden="true"><div className={key === 'webmcp' ? styles.webmcpBar : styles.baselineBar} style={{ width: `${item[key][metric] / max * 100}%` }} /></div>
          <span className={styles.barMeta}>{zh ? '完整成功' : 'Complete success'} {item[key].successes}/{item[key].runs} <span>·</span> {item[key].calls} {zh ? '次调用（中位数）' : 'calls (median)'}</span>
        </div>)}
      </div>
      <p className={styles.chartNote}>{selected === 2
        ? (zh ? '两组不同期、评论实时变化，普通组未完整完成。耗时与 Token 并列展示，不代表完成同等工作的加速倍数。普通组允许文件记录与离线脚本。' : 'Historical comparison with live comments and unequal completion. Time and tokens are descriptive, not an equal-work speedup. Computer Use allowed file notes and offline scripts.')
        : (zh ? '同批各 5 轮；普通组允许 DevTools 和临时浏览器脚本。展示已安装工具的复用，构建与准备时间不计入。' : 'Five runs per group in the same batch. The baseline allowed DevTools and ad hoc browser scripts. Installed-tool reuse; authoring and preparation excluded.')}</p>
      {metric === 'tokens' && <p className={styles.tokenNote}>{zh ? '总 Token 包含缓存读取与重复输入，不等于费用。' : 'Total tokens include cached reads and repeated inputs, not monetary cost.'}</p>}
    </div>
  </div>;
}
