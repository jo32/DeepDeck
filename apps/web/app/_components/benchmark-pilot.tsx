'use client';
import { useRef, useState, type FormEvent } from 'react';
import type { SiteLocale } from '../../lib/locale';
import s from './benchmark.module.css';

export function BenchmarkPilot({ locale }: { locale: SiteLocale }) {
  const zh=locale==='zh';
  const t=(cn:string,en:string)=>zh?cn:en;
  const [state,setState]=useState<'idle'|'sending'|'success'|'error'>('idle');
  const [receipt,setReceipt]=useState('');
  const [error,setError]=useState('');
  const attempt=useRef<{body:string;id:string}|null>(null);
  const pending=useRef(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending.current)return;
    const form=new FormData(event.currentTarget);
    const fields={team:String(form.get('team')).trim(),email:String(form.get('email')).trim(),target:String(form.get('target')).trim(),goal:form.get('goal'),surface:form.get('surface'),tasks:String(form.get('tasks')).trim(),consent:form.get('consent')==='on',website:form.get('website'),locale};
    const serialized=JSON.stringify(fields);
    if(attempt.current?.body!==serialized)attempt.current={body:serialized,id:crypto.randomUUID()};
    pending.current=true;setState('sending');setError('');
    try {
      const response=await fetch('/api/benchmarks/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,id:attempt.current.id}),signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(!response.ok){
        if(response.status===429)throw new Error(t('申请较多，请等待一分钟后重试。填写内容已保留。','Too many requests. Wait one minute and retry. Your fields are preserved.'));
        if(response.status===400||response.status===413)throw new Error(t('请检查填写内容，任务说明至少 10 个字符，且不超过 2,000 个字符。','Check the form. Task details must contain 10–2,000 characters.'));
        throw new Error(t('暂时无法确认申请已保存，请稍后重试。重复提交相同内容不会创建重复申请。','We could not confirm that your application was saved. Please retry. Retrying the same content will not create a duplicate.'));
      }
      if(data.status!=='received'||data.id!==attempt.current.id)throw new Error(t('未收到有效回执，请重试。','No valid receipt was received. Please retry.'));
      setReceipt(data.id);setState('success');
    } catch(e) {setError(e instanceof Error && e.name!=='TimeoutError' && e.name!=='TypeError'?e.message:t('网络连接中断或超时，尚无法确认保存结果。请重试，填写内容已保留。','The connection failed or timed out. Saving is unconfirmed. Retry with the preserved form.'));setState('error');}
    finally{pending.current=false;}
  }
  return <form className={s.pilotForm} onSubmit={submit}>
    <div className={s.formTop}><span className={s.eyebrow}>YOUR FIRST EVALUATION</span><h3>{t('申请试点评测','Apply for a pilot')}</h3><p>{t('告诉我们你的 Agent、目标任务，以及成功率、token 或耗时方面的目标。','Tell us about your agent, tasks, and goals for success, tokens, or time.')}</p></div>
    {state==='success'?<div className={s.receipt} role="status"><span aria-hidden="true">✓</span><h4>{t('已收到申请','Application received')}</h4><p>{t('需求已保存。DeepDeck 将通过你填写的邮箱与你沟通试点范围。','Your requirements are saved. DeepDeck will use your email to discuss the pilot scope.')}</p><dl><dt>{t('申请编号','Application reference')}</dt><dd>{receipt}</dd></dl><p>{t('这不是付款或自动开通服务；范围与报价另行确认。','This is not a payment or automatic service activation. Scope and pricing are agreed separately.')}</p></div>:<>
    <fieldset disabled={state==='sending'} className={s.formFields}>
      <div className={s.fieldGrid}><label>{t('团队或项目','Team or project')}<input name="team" required maxLength={120} autoComplete="organization" placeholder={t('你的 Agent 项目','Your agent project')} /></label><label>{t('联系邮箱','Contact email')}<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" /></label></div>
      <label>{t('目标网站或应用','Target website or app')}<input name="target" required maxLength={200} placeholder={t('例如：内部知识库','e.g. Internal knowledge base')} /></label>
      <div className={s.fieldGrid}><label>{t('主要评测目标','Primary goal')}<select name="goal"><option value="compare">{t('比较模型或 Agent 版本','Compare models or agent versions')}</option><option value="regression">{t('检测工作流退步','Detect workflow regressions')}</option><option value="readiness">{t('评估业务任务可用性','Assess business-task readiness')}</option></select></label><label>{t('Agent 的网页采集方式','Agent observation surface')}<select name="surface"><option value="screenshots">{t('截图与鼠标键盘','Screenshots, mouse and keyboard')}</option><option value="accessibility">{t('无障碍树与 UI 操作','Accessibility tree and UI actions')}</option><option value="dom">{t('包含 DOM 或浏览器脚本','Includes DOM or browser scripts')}</option><option value="undecided">{t('尚未确定','To be defined')}</option></select></label></div>
      <label>{t('任务与成功标准','Tasks and success criteria')}<textarea name="tasks" required minLength={10} maxLength={2000} rows={4} placeholder={t('例如：在知识库中检索指定主题，返回五条结果及来源；需要比较两个 Agent 版本。','For example: search a knowledge base and return five results with sources; compare two agent versions.')} /></label>
      <div className={s.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className={s.consent}><input name="consent" type="checkbox" required /><span>{t('同意 DeepDeck 保存以上信息，用于联系我并评估本次试点需求。','I agree that DeepDeck may store these details to contact me and evaluate this pilot request.')}</span></label>
      <button className={s.primary} type="submit">{state==='sending'?t('正在提交…','Submitting…'):t('提交试点申请','Submit pilot application')} <span aria-hidden="true">↗</span></button>
    </fieldset>
    <p className={s.formPrivacy}>{t('信息仅供 DeepDeck 联系你并评估试点需求，不公开展示。请勿填写密码、凭据或敏感业务数据。','DeepDeck uses these details to contact you and evaluate this pilot request. They are not publicly listed. Do not include passwords, credentials, or sensitive business data.')}</p>
    {state==='error'&&<p className={s.formError} role="alert">{error}</p>}
    </>}
  </form>;
}
