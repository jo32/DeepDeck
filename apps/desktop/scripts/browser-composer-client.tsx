// Real Harness skeleton, editor and permission menu with local fixture data.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../../../vendor/deepseek-harness/packages/client/ui-primitives/src/Modal';
import { Button } from '../../../vendor/deepseek-harness/packages/client/ui-primitives/src/Button';
import { PresentedFileCard } from '../../../vendor/deepseek-harness/packages/client/ui-deliverables/src/client/PresentedFileCard';
import { en as deliverablesEn } from '../../../vendor/deepseek-harness/packages/client/ui-deliverables/src/client/locales';
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/node_modules/lexical';
import chatCss from '../../../vendor/deepseek-harness/packages/client/ui-chat/src/client/chat/ChatView.module.css';
import { ConversationRoot } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot';
import { InputBar } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar';
import { en as conversationEn } from '../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/locales';
import { BrowserConversationContext, BrowserEmptyConversation } from '../../../plugins/browser/src/client/BrowserConversation';
import { en } from '../../../plugins/browser/src/client/locales';
import css from '../../../plugins/browser/src/client/browser.module.css';
import { BrowserModalLayer } from '../../../plugins/browser/src/client/BrowserModalLayer';
import '../../../vendor/deepseek-harness/packages/client/ui-theme/src/styles/base.css';
import '../../../vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css';
import '../../../vendor/deepseek-harness/packages/client/ui-theme/src/styles/scrollbar.css';

const modalRequest = async (input: unknown) => (await fetch('/modal', { method: 'POST', body: JSON.stringify(input) })).json();
const modalError = (message: string) => { throw new Error(message); };
function Fixture() {
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(420);
  const [draft, setDraft] = useState('');
  const [permission, setPermission] = useState('workspace-write');
  const [permissionCommands, setPermissionCommands] = useState(0);
  const [fileError, setFileError] = useState(false);
  const [fileAttempts, setFileAttempts] = useState(0);
  const openFile = () => { setFileAttempts(value => value + 1); setFileError(true); };
  const [editor] = useState(() => createEditor({ namespace: 'browser-fixture', onError: error => { throw error; } }));
  const [welcomeTarget, setWelcomeTarget] = useState<HTMLDivElement | null>(null);
  const input = { phase: 'idle', draft, attachmentIds: [], occurrences: [], queue: [] };
  const session = { openState: 'open', blank: !active, composerPhase: active ? 'active' : 'blank', pending: [], running: false };
  const select = (value: unknown) => (selector: (state: any) => unknown) => selector(value);
  const t = (key: keyof typeof conversationEn, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, value), conversationEn[key] ?? key);
  const renderSlot = (name: string, props: any) => {
    if (name === 'conversation.composer.bar') return <div data-slot={name} style={{ display: 'contents' }}><InputBar {...{
      ...props, sessionId: 'fixture', useInput: select(input), useSession: select(session),
      useNotices: select(undefined), useLexicon: select(new Map()), useMenuLauncher: select(undefined),
      useBusyEnter: select('queue'), useFileUploads: select({}),
      useProjection: (key: string, selector?: (value: unknown) => unknown) => {
        const value = key === 'permissions' ? { currentValue: permission, options: [
          { value: 'read-only', name: 'read-only' }, { value: 'workspace-write', name: 'workspace-write' },
          { value: 'danger-full-access', name: 'danger-full-access' },
        ] } : undefined;
        return selector ? selector(value) : value;
      },
      keyboard: { editor, snapshot: input, setDraft, bindFilePicker() {}, track() {}, arbitrate: () => 'pass', dismissPopup() {} },
      inputActions: { pruneAttachments() {}, submit() {} }, command: async (line: string) => {
        if (line.startsWith('/permission ')) {
          setPermission(line.slice('/permission '.length));
          setPermissionCommands(count => count + 1);
        }
        return true;
      },
      resolveDraftAttachments: () => [], renderSlot: () => null, t,
    } as any} /></div>;
    if (name === 'conversation.input.dock') return <BrowserEmptyConversation {...{ session } as any} />;
    if (name === 'conversation.session' && active) return <div data-slot={name} style={{ display: 'contents' }}><div className={chatCss.root}><div className={chatCss.scroll}><div className={chatCss.column} data-chat-flow>
      <p data-fixture-long-path>{'webmcp-publish/project/source/'.repeat(30)}</p>
      <pre data-fixture-code style={{ overflowX: 'auto', maxWidth: '100%' }}>{'const longOutput = "example"; '.repeat(50)}</pre>
      {Array.from({ length: 25 }, (_, index) => <p key={index} style={{ padding: '12px 32px' }}>Conversation message {index + 1}</p>)}
    </div></div></div></div>;
    return <div data-slot={name} style={{ display: 'contents' }} />;
  };
  return <main className={css.browser} data-fixture-permission={permission} data-fixture-permission-commands={permissionCommands} data-fixture-file-attempts={fileAttempts}>
    <div className={css.chrome} style={{ padding: 20 }}>
      <button data-fixture-action="messages" onClick={() => setActive(value => !value)}>Toggle messages</button>
      <button data-fixture-action="resize" onClick={() => setWidth(value => value === 420 ? 360 : 420)}>Resize sidebar</button>
      <button data-fixture-action="draft" onClick={() => {
        const text = 'A long draft line.\n'.repeat(30);
        setDraft(text);
        editor.update(() => { $getRoot().clear().append($createParagraphNode().append($createTextNode(text))); });
      }}>Long draft</button>
    </div>
    <div className={css.body}>
      <div className={css.page} data-fixture-page><BrowserModalLayer request={modalRequest} onError={modalError} /></div>
      <aside className={css.panel} data-fixture-panel style={{ '--browser-panel-width': `${width}px` } as any}>
        <div className={css.panelHeader}>example.com · Connected</div>
        <div className={css.panelNavigation}><div className={css.panelNav}><button>Conversation</button></div></div>
        <PresentedFileCard file={{ path: 'CONTRIBUTING.md', description: 'Contribution and verification guide', seq: 1, index: 0 } as any}
          cwd="/tmp/fixture" phase={undefined} host={null} onPreview={openFile} onAction={() => {}}
          t={((key: keyof typeof deliverablesEn, vars: Record<string, string> = {}) => Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, value), deliverablesEn[key] ?? key)) as any} />
        {/* Same shared Modal used by ChatView's file-open failure dialog;
            the failing opener stays local to this layout fixture. */}
        <Modal open={fileError} title="Couldn’t open file" closeLabel="Close" onClose={() => setFileError(false)}
          description="The file could not be opened. CONTRIBUTING.md"
          footer={<><Button variant="outline" onClick={() => setFileError(false)}>Cancel</Button><Button variant="primary" onClick={openFile}>Retry</Button></>} />
        <div className={css.conversation}>
          <div ref={setWelcomeTarget} className={css.emptyMessageArea} />
          <BrowserConversationContext.Provider value={{ mode: 'use', welcomeTarget, t: ((key: keyof typeof en) => en[key]) as any }}>
            <div data-slot="conversation" style={{ display: 'contents' }}><ConversationRoot {...{
              sessionId: 'fixture', useSession: select(session), useInput: select(input),
              useSessionPendingInteraction: select(new Map()), useConversation: select({ activeTargets: new Set() }),
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
