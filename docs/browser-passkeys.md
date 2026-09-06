# Browser passkeys

On macOS, DeepDeck Browser uses the installed Google Chrome to complete explicit
WebAuthn sign-in. Chrome opens a temporary authentication window
at the requesting website's real origin, offers its system passkey/phone/security
key flow, and returns the one credential response to the original DeepDeck page.
The original login continues using its existing DeepDeck cookies and session.

Chrome is discovered in `/Applications` or `~/Applications`. Safari is not
implemented as an authentication provider. Windows/Linux and Macs without Chrome
retain Electron's native behavior and account chooser. This integration does not
require a new Apple entitlement, provisioning profile or release secret.

## Native boundary

This belongs in `apps/desktop`: Cordis cannot intercept the guest renderer's native
WebAuthn request or own an external browser process. The dedicated sandboxed
website preload replaces only `navigator.credentials.get` for public-key
requests; registration and password/federated operations remain native. The trusted Harness shell
never receives this preload and no Harness source, DOM, styles or event handling
is changed.

The bridge preserves credential/response prototypes, ArrayBuffer properties,
`toJSON()`, extension results and AbortSignal.
Conditional/autofill and silent requests do not open an external window; conditional
mediation availability is reported as false. Explicit sign-in is required.

## Origin binding and lifecycle

- IPC handlers are scoped to each managed website WebContents. Only its current
  main frame can request/cancel authentication. Cross-origin iframe ceremonies
  and related-origin RP delegation are not supported.
- The host derives the requesting origin from Electron's sender frame, accepts
  HTTPS (or loopback HTTP for development), and rejects unrelated relying parties.
  Chrome performs the full WebAuthn/public-suffix/authenticator validation.
- Chrome navigates to the real origin root, without the original URL's path,
  OAuth tokens or query string. A cross-origin redirect fails. Authentication runs
  in an isolated world without changing the website's DOM or network responses.
- Returned client data must match the original operation, challenge and origin,
  with no cross-origin ancestor. The source frame/URL must still be current.
- One ceremony is allowed at a time. AbortSignal, timeout, navigation/reload,
  renderer failure, tab/window closure and disposal cancel it. Closing Chrome
  rejects the original website's promise. The request timeout is capped at five
  minutes, including startup, with a separate 30-second page-loading limit.
- Chrome uses a new temporary profile and a private inherited CDP pipe. It does
  not use a TCP debugging port, the user's regular Chrome profile or their Chrome
  cookies. Only the owned browser process is closed, and its temporary profile is
  removed. Normal Chrome windows remain open.
- Assertions/challenges and extension results are not logged or sent through the
  Harness, Browser Agent or telemetry. Private keys stay with the authenticator.

The temporary profile can use system/iCloud passkeys and phone authentication
when Chrome and the OS offer them. Chrome-profile-only credentials, extensions
and signed-in Google Password Manager state are not imported. Registration stays
with Electron so credentials cannot accidentally be enrolled into a Chrome
profile that will be removed after the request. Available methods
still depend on the site's request, the OS and the device holding the passkey.
A site whose origin root redirects elsewhere is currently unsupported.

## Verification

Run `pnpm check`, `pnpm test`, and `pnpm build`. Focused tests cover sender and RP
validation, stale documents, global concurrency, cancellation/cleanup, CDP pipe
framing, protocol failures, binary request/response conversion and API behavior.

On macOS with Chrome installed:

```sh
node apps/desktop/scripts/verify-browser-passkeys.mjs
node apps/desktop/scripts/verify-browser-passkeys.mjs --native-ui
```

The automated fixture opens the actual Electron Browser manager and website
preload with a disposable localhost page/profile. Only the Chrome authenticator
is replaced with virtual test keys. It seeds a disposable virtual credential and signs in through the
full Electron -> Chrome -> Electron path, verifies the assertion signature,
challenge/origin/RP and user-verification flags, then tests closing Chrome,
AbortSignal cleanup and a subsequent successful sign-in. Production never enables
virtual authenticators. `DEEPDECK_PASSKEY_TRACE=1` prints fixture operation phases.

The native-UI fixture uses the production provider and a synthetic localhost
challenge. Inspect the available authentication methods and cancel; no account
login or credential creation is needed. A NotAllowedError alone does not prove a
prompt was displayed (it can also indicate a timeout). Final real-account
verification requires the user to finish Touch ID or phone approval themselves.
