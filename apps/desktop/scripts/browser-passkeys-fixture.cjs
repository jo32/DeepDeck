const { app, BaseWindow, webContents } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, verify } = require('node:crypto');
const { createBrowserWindowManager, installBrowserPasskeyBridge, performChromePasskey, openPasskeyChrome } = require(process.env.DEEPDECK_BROWSER_TEST_BUNDLE);
app.setPath('userData', process.env.DEEPDECK_BROWSER_TEST_PROFILE);
const nativeUI = process.argv.includes('--native-ui');
const timeout = setTimeout(() => { console.error('Passkey verification timed out'); app.exit(1); }, nativeUI ? 180000 : 120000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let attempt = 0; attempt < 300; attempt++) { const value = await read(); if (value) return value; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
const page = `<title>DeepDeck passkey verification</title>
<style>body{font:20px system-ui;padding:40px;color:#202020;background:#f5f5f5}h1{font-size:30px}</style>
<h1>Passkey verification</h1><p>Testing Chrome verification and return to the original DeepDeck page. Temporary test credentials only.</p>`;
let manager;
let currentChrome;
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(page); });
(async () => {
  await app.whenReady();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://localhost:${port}`;
  const shell = `http://127.0.0.1:${port}/?deepdeck-surface=browser`;
  manager = createBrowserWindowManager('Passkey verification', () => {});
  await manager.execute({ action: 'open', shellUrl: shell, url: origin });
  const contents = await until(() => webContents.getAllWebContents().find(wc => wc.getURL() === `${origin}/`), 'website');
  await until(() => !contents.isLoading(), 'website load');
  async function evaluate(expression) {
    const result = await contents.debugger.sendCommand('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  assert.equal(await evaluate('typeof window.deepdeckPasskeys?.request'), 'function');
  assert.equal(await evaluate('PublicKeyCredential.isConditionalMediationAvailable()'), false);
  const harness = webContents.getAllWebContents().find(wc => wc.getURL() === shell);
  assert(harness && !harness.getLastWebPreferences().preload, 'The Harness shell must have no website passkey preload');
  if (nativeUI) {
    console.log('Native Chrome passkey UI ready; cancel the dialog after checking the available methods.');
    const result = await evaluate(`navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',userVerification:'required',timeout:150000}}).then(()=> 'unexpected credential',e=>e.name)`);
    assert.equal(result, 'NotAllowedError');
    console.log('Production provider returned NotAllowedError to DeepDeck; confirm UI visibility manually.');
    return;
  }
  // Replace only the authenticator provider with disposable virtual keys inside
  // Chrome. The production manager, preload, IPC, navigation and return all run.
  contents.ipc.removeHandler('deepdeck:browser:passkey');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let credentials = [{ credentialId: randomBytes(32).toString('base64'), isResidentCredential: true, rpId: 'localhost',
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    userHandle: Buffer.from('Bob').toString('base64'), signCount: 0 }];
  let mode = 'success';
  let opened = 0;
  let closed = 0;
  installBrowserPasskeyBridge(contents, () => BaseWindow.getAllWindows()[0], (request, targetOrigin, signal) =>
    performChromePasskey(request, targetOrigin, signal, async () => {
      const chrome = await openPasskeyChrome(signal); currentChrome = chrome; opened++;
      if (process.env.DEEPDECK_PASSKEY_TRACE) console.log('Chrome opened');
      let targetId, sessionId, authenticatorId;
      return {
        send: async (method, params, session) => {
          if (process.env.DEEPDECK_PASSKEY_TRACE) console.log('send', method);
          if (method === 'Runtime.evaluate' && mode === 'close') setTimeout(() => void chrome.send('Target.closeTarget', { targetId }).catch(() => {}), 250);
          const result = await chrome.send(method, params, session);
          if (process.env.DEEPDECK_PASSKEY_TRACE) console.log('received', method);
          if (method === 'Target.createTarget') targetId = result.targetId;
          if (method === 'Target.attachToTarget') sessionId = result.sessionId;
          if (method === 'Page.bringToFront') {
            await chrome.send('WebAuthn.enable', { enableUI: false }, sessionId);
            ({ authenticatorId } = await chrome.send('WebAuthn.addVirtualAuthenticator', { options: {
              protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
              isUserVerified: true, automaticPresenceSimulation: mode === 'success',
            } }, sessionId));
            for (const credential of credentials) await chrome.send('WebAuthn.addCredential', { authenticatorId, credential }, sessionId);
          }
          if (method === 'Runtime.evaluate' && mode === 'success') {
            ({ credentials } = await chrome.send('WebAuthn.getCredentials', { authenticatorId }, sessionId));
          }
          return result;
        },
        close: async () => { await chrome.close(); currentChrome = undefined; closed++; },
      };
    }));
  const array = value => `Uint8Array.from(atob(${JSON.stringify(value)}), c => c.charCodeAt(0))`;
  const challenge = randomBytes(32).toString('base64');
  const assertion = await evaluate(`navigator.credentials.get({publicKey:{
    challenge:${array(challenge)},rpId:'localhost',userVerification:'required',timeout:30000
  }}).then(value=>({json:value.toJSON(),instance:value instanceof PublicKeyCredential,
    response:value.response instanceof AuthenticatorAssertionResponse,buffer:value.response.signature instanceof ArrayBuffer,
    extensions:value.getClientExtensionResults()}))`);
  assert(assertion.instance && assertion.response && assertion.buffer);
  const json = assertion.json;
  assert.equal(Buffer.from(json.response.userHandle, 'base64url').toString(), 'Bob');
  const clientData = Buffer.from(json.response.clientDataJSON, 'base64url');
  const client = JSON.parse(clientData);
  assert.equal(client.type, 'webauthn.get'); assert.equal(client.origin, origin);
  assert.equal(client.challenge, Buffer.from(challenge, 'base64').toString('base64url'));
  const authenticatorData = Buffer.from(json.response.authenticatorData, 'base64url');
  assert(authenticatorData.subarray(0, 32).equals(createHash('sha256').update('localhost').digest()));
  assert.equal(authenticatorData[32] & 5, 5);
  assert(verify('sha256', Buffer.concat([authenticatorData, createHash('sha256').update(clientData).digest()]),
    createPublicKey(createPrivateKey({ key: Buffer.from(credentials[0].privateKey, 'base64'), format: 'der', type: 'pkcs8' })),
    Buffer.from(json.response.signature, 'base64url')));
  console.log('PASS: DeepDeck -> Chrome login -> original page, credential types, origin/challenge/RP and signature');
  mode = 'close';
  const closedResult = await evaluate(`navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',timeout:15000}}).then(()=> 'unexpected',e=>e.name)`);
  assert.equal(closedResult, 'NotAllowedError');
  console.log('PASS: closing the Chrome window rejects the original request');
  mode = 'abort';
  const aborted = await evaluate(`(async()=>{const control=new AbortController();setTimeout(()=>control.abort(),2000);
    try { await navigator.credentials.get({signal:control.signal,publicKey:{challenge:new Uint8Array(32),rpId:'localhost',timeout:15000}});return 'unexpected'; }catch(e){return e.name;}})()`);
  assert.equal(aborted, 'AbortError');
  await until(() => closed === opened, 'Chrome cleanup');
  mode = 'success';
  const recovered = await evaluate(`navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',timeout:30000}}).then(value=>value.type)`);
  assert.equal(recovered, 'public-key');
  assert.equal(opened, closed);
  console.log('PASS: AbortSignal, cleanup, and signing in again after cancellation');
})().then(() => {
  clearTimeout(timeout); manager?.dispose(); server.close(); app.quit();
}).catch(async error => {
  console.error(error); clearTimeout(timeout); await currentChrome?.close(); manager?.dispose(); server.close(); app.exit(1);
});
