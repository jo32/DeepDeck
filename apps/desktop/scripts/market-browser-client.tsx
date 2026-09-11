import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as JsxRuntime from 'react/jsx-runtime';
import * as Primitives from '@deepseek-ai/dsh-client-ui-primitives';
import { createWorkspaceFiles } from '../../../plugins/browser/src/client/WorkspaceFiles';
// A real Browser plugin surface in the isolated Electron verification profile.
// Agent services are idle; all browsing commands go through the native manager.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserFrame } from '../../../plugins/browser/src/client/BrowserFrame';
import { en } from '../../../plugins/browser/src/client/locales';
const request = async (input: unknown) => {
  const response = await fetch('/api', { method: 'POST', body: JSON.stringify(input) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
};
const services: Record<string, unknown> = {};
const modules: Record<string, unknown> = { react: React, 'react/jsx-runtime': JsxRuntime, 'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient, '@deepseek-ai/dsh-client-ui-primitives': Primitives };
const Files = createWorkspaceFiles({
  locale: { getSnapshot: () => ({ active: 'en' }), bind: () => (key: keyof typeof en) => en[key] },
  provide: (name: string, value: unknown) => { services[name] = value },
  get: (name: string) => name === 'modules' ? { import: async (key: string) => modules[key] ?? {} } : services[name],
  sessions: { scope: () => undefined },
  effect: (setup: () => unknown) => setup(),
} as unknown as Parameters<typeof createWorkspaceFiles>[0]);
Object.assign(window, { fixtureSidebar: services.betterSidebar });
createRoot(document.getElementById('root')!).render(createElement(BrowserFrame, {
  browser: { Files, request, publishWebMCP: async (sessionId: string, site: unknown, directory: string, intent: string) => { Object.assign(window, { fixturePublication: { sessionId, site, directory, intent } }) }, prepareAgent: async (tabId: string) => ({ siteId: 'fixture', sessionId: 'fixture-session', tabId }) },
  character: { Icon: () => null, Character: () => null, DockedComposer: ({ children }: { children: React.ReactNode }) => children },
  t: (key: keyof typeof en) => en[key], renderConversation: () => createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: 16, gap: 12 } }, createElement('p', null, 'Review the WebMCP draft while chatting with the site Agent.'), createElement('textarea', { 'aria-label': 'Fixture chat', placeholder: 'Ask the site Agent…', style: { marginTop: 'auto', minHeight: 80, resize: 'none' } })),
  useSessions: (select: (value: unknown) => unknown) => select({ byId: { 'fixture-session': { running: false } }, current: 'fixture-session' }),
} as unknown as Parameters<typeof BrowserFrame>[0]));
