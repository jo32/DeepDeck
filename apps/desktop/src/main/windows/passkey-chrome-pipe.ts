import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { PasskeyError } from '../../shared/browser-passkey.js';

// CDP is a versioned JSON boundary; it never leaves our child process's private pipe.
type RecordValue = Record<string, any>;
export interface PasskeyChrome {
  send(method: string, params?: RecordValue, sessionId?: string): Promise<RecordValue>;
  close(): Promise<void>;
}

export function findPasskeyChrome(): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  return [join('/Applications', 'Google Chrome.app/Contents/MacOS/Google Chrome'),
    join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')].find(existsSync);
}

/** Owns a separate temporary profile, never the user's normal Chrome process. */
export async function openPasskeyChrome(signal: AbortSignal): Promise<PasskeyChrome> {
  signal.throwIfAborted();
  const executable = findPasskeyChrome();
  if (!executable) throw new PasskeyError('NotSupportedError', 'Install Google Chrome to use passkeys in DeepDeck Browser.');
  const directory = await mkdtemp(join(tmpdir(), 'deepdeck-passkey-'));
  let child: ChildProcess;
  try {
    signal.throwIfAborted();
    child = spawn(executable, [`--user-data-dir=${directory}`, '--remote-debugging-pipe',
      '--no-first-run', '--no-default-browser-check', '--no-startup-window'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let ended = false;
  const exit = new Promise<void>(resolve => {
    const finish = () => { ended = true; resolve(); };
    child.once('exit', finish); child.once('error', finish);
  });
  const pipe = new PasskeyChromePipe(child.stdio[3] as Writable, child.stdio[4] as Readable);
  child.once('error', () => pipe.fail());
  child.once('exit', () => pipe.fail());
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    signal.removeEventListener('abort', abort);
    // Browser.close has no guaranteed reply if the user already closed the window.
    if (!ended) {
      void pipe.send('Browser.close').catch(() => {});
      const terminate = setTimeout(() => child.kill('SIGTERM'), 1000);
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exit;
      clearTimeout(terminate); clearTimeout(force);
    }
    pipe.fail();
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  })();
  const abort = () => { pipe.fail(signal.reason); void close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  // Closing the auth window must cancel an outstanding Runtime.evaluate too.
  let target: string | undefined;
  pipe.onEvent = (method, params) => { if (method === 'Target.targetDestroyed' && params.targetId === target) abort(); };
  return { send: async (method, params, sessionId) => {
    const result = await pipe.send(method, params, sessionId);
    if (method === 'Target.createTarget') target = result.targetId;
    return result;
  }, close };
}

export class PasskeyChromePipe {
  private serial = 0;
  private buffer: Buffer = Buffer.alloc(0);
  private pending = new Map<number, { resolve(value: RecordValue): void; reject(error: Error): void }>();
  private failure: Error | undefined;
  onEvent?: (method: string, params: RecordValue) => void;
  constructor(private input: Writable, output: Readable) {
    input.on('error', () => this.fail());
    output.on('error', () => this.fail());
    output.on('end', () => this.fail());
    output.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > 8 * 1024 * 1024) { this.fail(); return; }
      let end: number;
      while ((end = this.buffer.indexOf(0)) >= 0) {
        const raw = this.buffer.subarray(0, end).toString();
        this.buffer = this.buffer.subarray(end + 1);
        if (!raw) continue;
        let value: RecordValue;
        try { value = JSON.parse(raw); } catch { this.fail(); return; }
        const request = this.pending.get(value.id);
        if (request) {
          this.pending.delete(value.id);
          if (value.error) request.reject(new PasskeyError('NotAllowedError', 'The browser could not complete passkey verification.'));
          else request.resolve(value.result ?? {});
        } else if (value.method) this.onEvent?.(value.method, value.params ?? {});
      }
    });
  }
  send(method: string, params: RecordValue = {}, sessionId?: string): Promise<RecordValue> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  fail(reason?: unknown): void {
    this.failure ??= reason instanceof Error ? reason : new PasskeyError('NotAllowedError', 'Passkey verification was cancelled or the browser was closed.');
    for (const request of this.pending.values()) request.reject(this.failure);
    this.pending.clear();
    this.buffer = Buffer.alloc(0);
  }
}
