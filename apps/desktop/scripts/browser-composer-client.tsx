// Real Harness skeleton, editor and permission menu with local fixture data.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationRoot } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot';
import { InputBar } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar';
import { en as conversationEn } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/locales';
import { BrowserConversationContext, BrowserEmptyConversation } from '../../../plugins/browser/src/client/BrowserConversation';
import { en } from '../../../plugins/browser/src/client/locales';
import css from '../../../plugins/browser/src/client/browser.module.css';
import '../../../vendor/deepseek-harness/packages/client/ui-theme/src/styles/base.css';
import '../../../vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css';
import '../../../vendor/deepseek-harness/packages/client/ui-theme/src/styles/scrollbar.css';

function Fixture() {
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(420);
  const [draft, setDraft] = useState('');
  const [welcomeTarget, setWelcomeTarget] = useState<HTMLDivElement | null>(null);
  const input = { phase: 'idle', draft, imageIds: [], occurrences: [], queue: [] };
  const session = { openState: 'open', blank: !active, composerPhase: active ? 'active' : 'blank', pending: [], running: false };
  const select = (value: unknown) => (selector: (state: any) => unknown) => selector(value);
  const t = (key: keyof typeof conversationEn, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, value), conversationEn[key] ?? key);
  const renderSlot = (name: string, props: any) => {
    if (name === 'conversation.composer.bar') return <div data-slot={name} style={{ display: 'contents' }}><InputBar {...{
      ...props, sessionId: 'fixture', useInput: select(input), useSession: select(session),
      useNotices: select(undefined), useLexicon: select(new Map()), useMenuLauncher: select(undefined),
      useProjection: (key: string, selector?: (value: unknown) => unknown) => {
        const value = key === 'permissions' ? { currentValue: 'workspace-write', options: [
          { value: 'read-only', name: 'read-only' }, { value: 'workspace-write', name: 'workspace-write' },
          { value: 'danger-full-access', name: 'danger-full-access' },
        ] } : undefined;
        return selector ? selector(value) : value;
      },
      keyboard: { snapshot: input, setDraft, track() {}, arbitrate: () => 'pass', dismissPopup() {} },
      inputActions: { pruneImages() {}, submit() {} }, command: async () => true,
      draftImages: () => [], renderSlot: () => null, t,
    } as any} /></div>;
    if (name === 'conversation.input.dock') return <BrowserEmptyConversation {...{ session } as any} />;
    if (name === 'conversation.session' && active) return <div data-slot={name} style={{ display: 'contents' }}><div>
      {Array.from({ length: 25 }, (_, index) => <p key={index} style={{ padding: '12px 32px' }}>Conversation message {index + 1}</p>)}
    </div></div>;
    return <div data-slot={name} style={{ display: 'contents' }} />;
  };
  return <main className={css.browser}>
    <div className={css.chrome} style={{ padding: 20 }}>
      <button data-fixture-action="messages" onClick={() => setActive(value => !value)}>Toggle messages</button>
      <button data-fixture-action="resize" onClick={() => setWidth(value => value === 420 ? 360 : 420)}>Resize sidebar</button>
      <button data-fixture-action="draft" onClick={() => { setDraft('A long draft line.\n'.repeat(30)); }}>Long draft</button>
    </div>
    <div className={css.body}>
      <div className={css.page} />
      <aside className={css.panel} style={{ '--browser-panel-width': `${width}px` } as any}>
        <div className={css.panelHeader}>example.com · Connected</div>
        <div className={css.panelNavigation}><div className={css.panelNav}><button>Conversation</button></div></div>
        <div className={css.conversation}>
          <div ref={setWelcomeTarget} className={css.emptyMessageArea} />
          <BrowserConversationContext.Provider value={{ mode: 'use', welcomeTarget, t: ((key: keyof typeof en) => en[key]) as any }}>
            <div data-slot="conversation" style={{ display: 'contents' }}><ConversationRoot {...{
              sessionId: 'fixture', useSession: select(session), useInput: select(input),
              useSessions: select({ byId: { fixture: { cwd: '/tmp', blank: !active } } }),
              useWorkspaces: select({ phase: 'ready', items: [{ title: 'Fixture', workspaceId: 'fixture', sessionIds: ['fixture'] }] }),
              useComposerBlock: select(undefined), renderSlot, renderSlotChain: (_name: string, _props: unknown, options: any) => options.fallback, t,
            } as any} /></div>
          </BrowserConversationContext.Provider>
        </div>
      </aside>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
