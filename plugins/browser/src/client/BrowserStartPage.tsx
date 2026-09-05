import { useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserMode, BrowserSite } from '../contracts.js'
import { BROWSER_LOCALE } from './locales.js'
import { BrowserIcon } from './icons.js'
import type { DeepDeckCharacterService } from '@deepdeck/dsh-client-ui-home-hero/character-contract'
import css from './start-page.module.css'

export interface BrowserStartPageProps extends PropsLocale<typeof BROWSER_LOCALE> {
  sites: BrowserSite[]
  onOpen: (address: string, mode?: BrowserMode) => Promise<void>
  character: DeepDeckCharacterService
}

/** The start page uses the Host's saved sites; it does not keep another history. */
export function BrowserStartPage({ sites, onOpen, character, t }: BrowserStartPageProps) {
  const [address, setAddress] = useState('')
  const [intent, setIntent] = useState<BrowserMode>()
  const [expanded, setExpanded] = useState(false)
  const [opening, setOpening] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const open = async (value: string, mode?: BrowserMode) => {
    if (opening || value.trim() === '') return
    setOpening(true)
    try { await onOpen(value, mode) }
    finally { setOpening(false) }
  }
  const choose = (mode: BrowserMode) => {
    setIntent(intent === mode ? undefined : mode)
    input.current?.focus()
  }

  return <div className={css.startPage}>
    <div className={css.content}>
      <div className={css.identity}><character.Icon size={25} /><span>DeepDeck <span>Browser</span></span></div>
      <section className={css.hero} aria-labelledby="browser-start-title">
        <div className={css.character}><character.Character active={opening} /></div>
        <h1 id="browser-start-title">{t('startTitle')}</h1>
        <p>{t('startDescription')}</p>
        <form className={css.search} onSubmit={event => { event.preventDefault(); void open(address, intent) }}>
          <BrowserIcon name="search" />
          <input ref={input} value={address} onChange={event => { setAddress(event.target.value) }}
            aria-label={t('startAddress')} placeholder={t('address')} autoComplete="off" spellCheck={false} />
          <button type="submit" disabled={opening || address.trim() === ''} aria-label={t('go')}>
            <BrowserIcon name="forward" />
          </button>
        </form>
        <div className={css.searchMeta}>
          <span aria-live="polite">{t(intent === 'builder' ? 'startBuilderHint' : intent === 'use' ? 'startAgentHint' : 'startSearchHint')}</span>
          {intent !== undefined && <button type="button" onClick={() => { setIntent(undefined); input.current?.focus() }}>{t('cancel')}</button>}
        </div>
      </section>

      {sites.length > 0 && <section className={css.sites} aria-labelledby="browser-sites-title">
        <div className={css.sectionHeading}><h2 id="browser-sites-title">{t('yourSites')}</h2>
          {sites.length > 4 && <button type="button" aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>{t(expanded ? 'showLess' : 'showAll')}<BrowserIcon name="chevron" /></button>}
        </div>
        <div className={css.siteGrid}>
          {(expanded ? sites : sites.slice(0, 4)).map(site => <button key={site.id} type="button" className={css.site}
            disabled={opening} onClick={() => { void open(site.origin, intent) }} title={site.origin}>
            <span className={css.siteMonogram} aria-hidden="true">{site.origin.replace(/^https?:\/\/(www\.)?/, '').slice(0, 1).toUpperCase()}</span>
            <span className={css.siteIdentity}><strong>{site.title || site.origin.replace(/^https?:\/\//, '')}</strong><span>{site.origin.replace(/^https?:\/\//, '')}</span></span>
            <BrowserIcon name="arrowUpRight" />
          </button>)}
        </div>
      </section>}

      <section className={css.actions} aria-label={t('startActions')}>
        <button type="button" className={css.action} aria-pressed={intent === 'use'} onClick={() => { choose('use') }}>
          <span className={css.actionHeader}><span className={css.actionIcon}><BrowserIcon name="agent" /></span><span className={css.actionLabel}>SITE AGENT</span></span>
          <strong>{t('startAgentTitle')}</strong><span className={css.actionDescription}>{t('startAgentDescription')}</span>
          <span className={css.actionLink}>{t('chooseSite')}<BrowserIcon name="forward" /></span>
        </button>
        <button type="button" className={css.action} aria-pressed={intent === 'builder'} onClick={() => { choose('builder') }}>
          <span className={css.actionHeader}><span className={css.actionIcon}><BrowserIcon name="webmcp" /></span><span className={css.actionLabel}>WEBMCP BUILDER</span></span>
          <strong>{t('startBuilderTitle')}</strong><span className={css.actionDescription}>{t('startBuilderDescription')}</span>
          <span className={css.actionLink}>{t('chooseSite')}<BrowserIcon name="forward" /></span>
        </button>
      </section>
      <footer className={css.footer}>
        <span>{t('startFooter')}</span>
        <span className={css.shortcuts}><span><kbd>{/Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'} L</kbd>{t('focusAddress')}</span><span><kbd>{/Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'} T</kbd>{t('newTab')}</span></span>
      </footer>
    </div>
  </div>
}
