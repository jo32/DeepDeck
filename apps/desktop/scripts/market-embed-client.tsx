import { createRoot } from 'react-dom/client'
import { WebMCPMarket } from '../../../plugins/browser/src/client/WebMCPMarket.js'
import { WebMCPDirectory } from '../../web/app/_components/webmcp-directory.js'
import { SettingsPanel } from '../../../plugins/desktop-chrome/src/client/settings-shell.js'
import { en } from '../../../plugins/browser/src/client/locales.js'
declare global { interface Window { marketFixture: { kind: 'directory' | 'host' | 'local'; marketUrl: string; catalog: unknown } } }
const fixture = window.marketFixture
createRoot(document.getElementById('root')!).render(fixture.kind === 'directory'
  ? <WebMCPDirectory locale="en" catalog={fixture.catalog} />
  : <SettingsPanel rows={[{ id: 'general', label: 'General' }, { id: 'store', label: 'Store' }, { id: 'webmcp-market', label: 'WebMCP market' }]} activeId="webmcp-market" onSelect={() => {}} onClose={() => {}} renderSlot={(name: string) => name === 'settings.section' ? <WebMCPMarket t={key => en[key]} {...(fixture.kind === 'local' ? {} : { marketUrl: fixture.marketUrl })} /> : name === 'settings.header' ? 'Settings' : name === 'settings.close' ? 'Close' : null} />)
