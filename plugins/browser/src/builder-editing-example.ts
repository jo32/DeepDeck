/** Executable plain-textarea example included in the bundled Builder skill. */
export const WEBMCP_TEXT_EDITING_EXAMPLE = String.raw`
const sdk = (globalThis as any).__deepdeckWebMCP;
const editorIds = new WeakMap<HTMLTextAreaElement, string>();
let nextEditorId = 0;
function editor() {
  const matches = document.querySelectorAll('textarea[name="body"]');
  if (matches.length !== 1) throw new Error('Reply editor missing or ambiguous.');
  return matches[0] as HTMLTextAreaElement;
}
function identity(el: HTMLTextAreaElement) {
  let id = editorIds.get(el);
  if (!id) { id = String(++nextEditorId); editorIds.set(el, id); }
  return id;
}
sdk.registerTool({
  name: 'read_reply_draft',
  description: 'Read the reply draft for the Agent to revise, without submitting it.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  execute() {
    sdk.signal.throwIfAborted();
    const el = editor();
    if (el.value.length > 10000) throw new Error('Draft requires bounded/selection editing.');
    return { editorId: identity(el), text: el.value, maxLength: el.maxLength, editable: !el.matches(':disabled') && !el.readOnly };
  },
});
sdk.registerTool({
  name: 'write_reply_draft',
  description: 'Write Agent-supplied text to the same unchanged plain reply draft. Does not submit.',
  inputSchema: { type: 'object', properties: {
    editorId: { type: 'string', maxLength: 100 },
    text: { type: 'string', maxLength: 10000 }, expectedValue: { type: 'string', maxLength: 10000 },
  }, required: ['editorId', 'text', 'expectedValue'], additionalProperties: false },
  execute({ editorId, text, expectedValue }: { editorId: string; text: string; expectedValue: string }) {
    sdk.signal.throwIfAborted();
    const el = editor();
    if (identity(el) !== editorId || el.matches(':disabled') || el.readOnly || el.value !== expectedValue) throw new Error('Draft is unavailable or changed. Read it again.');
    if (typeof text !== 'string' || text.length > 10000 || (el.maxLength >= 0 && text.length > el.maxLength)) throw new Error('Invalid draft length.');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Textarea setter unavailable.');
    setter.call(el, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { status: 'filled', text: el.value, submitted: false, needsValidation: true };
  },
});
`.trim()
