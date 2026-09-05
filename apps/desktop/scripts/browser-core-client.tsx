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
createRoot(document.getElementById('root')!).render(createElement(BrowserFrame, {
  browser: { request, prepareAgent: async () => undefined },
  character: { Icon: () => null, Character: () => null },
  t: (key: keyof typeof en) => en[key], renderConversation: () => null,
  useSessions: (select: (value: unknown) => unknown) => select({ byId: {}, current: undefined }),
} as unknown as Parameters<typeof BrowserFrame>[0]));
