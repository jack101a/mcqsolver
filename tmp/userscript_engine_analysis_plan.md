# Userscript Engine Analysis Plan

Date: 2026-05-12
Workspace: `C:\codex\Antigravity\mcqsolver`
Reference clone: `tmp/violetmonkey-src`
Violetmonkey commit inspected: `ed71756`
Our extension branch/commit context: `before-scale` at `792c036`

## Goal

Make our backend-installed userscripts run much closer to Tampermonkey/Violetmonkey behavior, while keeping our current extension workflow:

- Backend/admin UI remains source of truth for scripts.
- Extension still auto-syncs scripts from backend.
- No full Tampermonkey/Violetmonkey UI clone.
- Existing MCQ solver, captcha, autofill, STALL, vcam, and Sarathi hardening modules must continue to work.

The right target is not "full Violetmonkey inside our extension". The right target is a compact userscript runtime that copies Violetmonkey's core architecture ideas: metadata normalization, accurate URL matching, dependency/resource caching, page/content realm execution, and a stronger GM API bridge.

## Current State In Our Extension

Relevant files:

- `extension/manifest.json`
- `extension/modules/userscript_engine.js`
- `extension/background.js`
- `backend/app/core/userscript_utils.py`
- `backend/app/api/routes.py`
- `backend/app/api/admin_routes/settings.py`
- `data/mappings/*.user.js`

What already exists:

- `extension/manifest.json` injects `modules/userscript_engine.js` at `document_start` on `<all_urls>`.
- `backend/app/api/routes.py` exposes `/v1/userscripts/sync`.
- `backend/app/api/admin_routes/settings.py` has admin CRUD endpoints for userscripts.
- `backend/app/core/userscript_utils.py` parses basic metadata.
- `extension/background.js` syncs backend scripts, fetches `@require` and `@resource`, and stores `normalized_userscripts`.
- `extension/modules/userscript_engine.js` matches scripts on page URL, schedules by `@run-at`, injects into `MAIN`, and exposes a small GM shim.
- Existing supported APIs include partial `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues`, `GM_xmlhttpRequest`, `GM_notification`, `GM_setClipboard`, `GM_getResourceText`, `GM_getResourceURL`.

Important current implementation points:

- Metadata parsing in extension: `extension/background.js:104`.
- Dependency bundling in extension: `extension/background.js:507`, `extension/background.js:520`, `extension/background.js:539`.
- Backend sync: `extension/background.js:707`.
- GM API message route: `extension/background.js:868`.
- Main-world execution: `extension/background.js:1285`.
- Content userscript runtime: `extension/modules/userscript_engine.js:118`, `extension/modules/userscript_engine.js:148`, `extension/modules/userscript_engine.js:175`, `extension/modules/userscript_engine.js:210`.
- Backend metadata parser: `backend/app/core/userscript_utils.py:3`.
- Backend userscript sync endpoint: `backend/app/api/routes.py:102`.
- Admin userscript endpoints: `backend/app/api/admin_routes/settings.py:272`, `backend/app/api/admin_routes/settings.py:336`, `backend/app/api/admin_routes/settings.py:374`, `backend/app/api/admin_routes/settings.py:410`.

Current limitations:

- URL matching is too simple. `@include`, regex-style includes, `.tld`, `@exclude-match`, hash/query behavior, invalid pattern reporting, and some wildcard edge cases are not close to VM/TM.
- `@grant none` is not treated as a true grantless page script. Our wrapper may still define GM-ish variables or inject in a way that differs from user expectations.
- All real execution currently goes through `chrome.scripting.executeScript(... world: 'MAIN')`, which is good for page access but weak for isolation and exposes our runtime to page interference.
- No true page/content realm strategy. Violetmonkey can choose page realm, content realm, or auto fallback; we cannot.
- `@require` is concatenated before code, but not cached/deduped with a dependency map like VM, and relative require/resource URLs are not resolved against installation URL.
- GM APIs are partial and callback/promise compatibility is incomplete.
- `GM_xmlhttpRequest` uses `fetch`, so it misses XHR-like events, abort, timeout, upload events, responseType handling, binary/blob/document/json behavior, and some header/cookie behavior.
- No `GM_addValueChangeListener`, `GM_removeValueChangeListener`, `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_openInTab`, `GM_download`, `GM_addElement`, `GM_log`, `GM_info`, `unsafeWindow` compatibility depth.
- No CSP/nonce handling. Script tag injection may fail on strict pages if we move away from `chrome.scripting`.
- No SPA URL-change rerun engine. Scripts run on initial content-script boot only unless the page reloads.
- No strong per-script lifecycle state such as running, matched, failed dependency, last error, last run, or tab/frame tracking.
- No robust userscript install normalization for `@namespace` + `@name` identity.

## Violetmonkey Core Findings

Violetmonkey is much more than a script injector. The useful core pieces are:

1. Metadata parser

- File: `tmp/violetmonkey-src/src/background/utils/script.js`
- Key function: `parseMeta` at line 104.
- Supports normalized/camelCased metadata, arrays for repeated keys, resources map, optional fields, localized fields, `@noframes`, `@connect`, top-level-await flags, unwrap flags, and validation errors.

2. URL matcher

- File: `tmp/violetmonkey-src/src/background/utils/tester.js`
- Key function: `testScript` at line 171.
- Supports `@match`, `@include`, `@exclude`, `@exclude-match`, pattern validation, regex includes, `.tld`, host/path optimizations, caches, blacklists.

3. Background script selection

- File: `tmp/violetmonkey-src/src/background/utils/db.js`
- Key function: `getScriptsByURL` at line 301.
- For each URL/frame, VM filters enabled scripts, respects `noframes`, groups scripts by `run-at`, finds required code/resources/values, and splits immediate vs delayed environment.

4. Injection preparation

- File: `tmp/violetmonkey-src/src/background/utils/preinject.js`
- Key functions: `prepareScripts` at line 468 and `prepareScript` at line 493.
- Builds a prepared injection object with code, metadata, sourceURL, require code, GM info, values, resources, run-at, realm, and script id.

5. Content/page injection bridge

- Files:
  - `tmp/violetmonkey-src/src/injected/content/index.js`
  - `tmp/violetmonkey-src/src/injected/content/inject.js`
- Key function: `injectScripts` at `inject.js:133`.
- Handles document-start/end/idle/body timing, page realm vs content realm, CSP fallback, nonce usage, closed shadow injection, same-origin iframe safety, and postMessage bridge setup.

6. GM API implementation

- File: `tmp/violetmonkey-src/src/injected/web/gm-api.js`
- Key exports:
  - `GM_API_CTX_GM4ASYNC` at line 16.
  - `GM_API_CTX` at line 83.
  - `GM_API` at line 164.
- Provides sync and async-style GM compatibility, value storage, resource APIs, menu commands, notifications, `GM_xmlhttpRequest`, tabs, clipboard, addStyle/addElement, and logging.

7. GM value change listeners

- File: `tmp/violetmonkey-src/src/injected/web/gm-values.js`
- Handles encoded values and remote change listener notifications across tabs.

8. GM_xmlhttpRequest

- Files:
  - `tmp/violetmonkey-src/src/injected/web/requests.js`
  - `tmp/violetmonkey-src/src/background/utils/requests.js`
- Key web function: `onRequestCreate` at `injected/web/requests.js:175`.
- Key background command: `HttpRequest` at `background/utils/requests.js:20`.
- Implements XHR-like callbacks/events, response types, binary data, FormData handling, cookie/header handling, abort, and chunked responses.

## What We Should Not Do

- Do not copy the whole Violetmonkey extension into ours.
- Do not add Violetmonkey's options/editor/sync/update UI.
- Do not replace our current popup/admin workflow.
- Do not refactor captcha, MCQ, autofill, STALL, vcam, or Sarathi modules as part of this.
- Do not make the backend execute userscripts. Backend should store, validate, resolve/cached dependencies if needed, and sync scripts to extension.
- Do not rely on one giant wrapper string forever. That becomes fragile as compatibility grows.

## Recommended Architecture

Add a small runtime layer inside our extension:

```text
Backend/admin UI
  -> stores raw .user.js + metadata + enabled flag
  -> optional dependency/resource cache metadata
  -> /v1/userscripts/sync returns normalized scripts

Extension background
  -> syncs scripts
  -> parses/normalizes with VM-compatible parser
  -> resolves relative @require/@resource URLs
  -> caches dependencies/resources
  -> exposes GM API commands
  -> prepares per-script runtime payload

Content script at document_start
  -> asks background which scripts match this URL/frame
  -> schedules start/end/idle/body
  -> injects page realm or content realm
  -> establishes bridge for GM calls
  -> reruns on SPA URL changes when needed

Page/content runtime
  -> gives each script isolated-ish context
  -> provides unsafeWindow, GM, GM_*, GM_info
  -> reports errors/logs back to background
```

Keep these current surfaces stable:

- Keep `normalized_userscripts` for now, but version it: `userscriptRuntimeVersion: 2`.
- Keep `USERSCRIPTS_SYNC` message.
- Keep `EXECUTE_IN_MAIN` for STALL and simple scripts, but userscript runtime should get its own messages so STALL code is not affected.
- Keep admin CRUD endpoints, but improve parser and validation.

## Phased Implementation Plan

### Phase 1 - Compatibility Foundation

Goal: make simple and medium scripts behave like VM/TM without touching unrelated modules.

Changes:

- Replace our regex-only metadata parser with a shared stricter parser on both backend and extension.
- Support these metadata keys consistently:
  - `@name`
  - `@namespace`
  - `@version`
  - `@description`
  - `@match`
  - `@include`
  - `@exclude`
  - `@exclude-match`
  - `@run-at`
  - `@noframes`
  - `@grant`
  - `@connect`
  - `@require`
  - `@resource`
  - `@icon`
  - `@downloadURL`
  - `@updateURL`
- Implement VM/TM-style matching in a new isolated file, likely `extension/modules/userscript_matcher.js`.
- Add tests using representative patterns:
  - `<all_urls>`
  - `*://*.example.com/*`
  - `https://site.tld/path/*`
  - `@include /^https:\/\/example\.com\/.+/`
  - excludes overriding includes/matches
  - `@noframes` in iframe context
- Preserve the current fallback behavior where empty matches become `<all_urls>` only for admin-created raw code without headers.

Expected outcome:

- Scripts run on the same pages where Violetmonkey would run them for common `@match` and `@include` patterns.
- Bad patterns are logged instead of silently failing.

### Phase 2 - Runtime Split Without Breaking Existing Flow

Goal: separate userscript runtime from STALL/main extension injection.

Changes:

- Create `extension/modules/userscript_runtime.js`.
- Let `userscript_engine.js` become the bootloader/scheduler only.
- Add dedicated background messages:
  - `USERSCRIPT_GET_MATCHES`
  - `USERSCRIPT_EXECUTE_PAGE`
  - `USERSCRIPT_GM_CALL`
  - `USERSCRIPT_ERROR`
- Keep old `EXECUTE_IN_MAIN` for STALL and legacy calls.
- Add a per-frame run registry using script id + URL/document marker, but allow rerun when SPA URL changes.
- Add URL-change observer in content script:
  - patch `history.pushState`
  - patch `history.replaceState`
  - listen to `popstate`
  - compare `location.href`
  - run newly matching scripts once per URL

Expected outcome:

- Userscripts become their own subsystem, so changes do not destabilize captcha/MCQ/STALL.
- SPA pages get scripts after route changes.

### Phase 3 - Dependency And Resource Cache

Goal: make `@require` and `@resource` reliable.

Changes:

- Move dependency fetch/caching into background, but keep backend as script source of truth.
- Resolve relative `@require` and `@resource` URLs against the script install/source URL when known.
- Store cached dependencies separately:
  - `userscript_require:<url>`
  - `userscript_resource:<url>`
  - `userscript_meta:<id>`
- Cache by URL and maybe response hash to avoid re-downloading every sync.
- Support `data:` resources where reasonable.
- Continue to return bundled resources to content runtime as text and data URL.
- Log dependency failures per script in `userscript_logs`.

Expected outcome:

- Common libraries loaded through `@require` work consistently.
- Scripts with CSS/images/resources can call `GM_getResourceText` and `GM_getResourceURL`.

### Phase 4 - Stronger GM API Bridge

Goal: cover the APIs most real-world scripts expect.

Add first:

- `GM_info`
- `unsafeWindow`
- `GM_addStyle`
- `GM_addElement`
- `GM_getValue`
- `GM_setValue`
- `GM_deleteValue`
- `GM_listValues`
- `GM_addValueChangeListener`
- `GM_removeValueChangeListener`
- `GM_getResourceText`
- `GM_getResourceURL`
- `GM_xmlhttpRequest`
- `GM_notification`
- `GM_setClipboard`
- `GM_openInTab`
- `GM_registerMenuCommand`
- `GM_unregisterMenuCommand`
- `GM_log`

Important compatibility detail:

- Support both legacy `GM_*` callback style and modern `GM.*` promise style.
- `@grant none` should not inject GM APIs except `GM_info` behavior if we choose to mimic VM/TM. It should run as close as possible to normal page JS.

Expected outcome:

- A large share of scripts that run in Violetmonkey/Tampermonkey will run in our extension, especially scripts using storage, resources, network, styles, and page access.

### Phase 5 - Better GM_xmlhttpRequest

Goal: replace current fetch-only implementation.

Changes:

- Implement XHR in background like Violetmonkey's request path.
- Support:
  - `method`
  - `url`
  - `headers`
  - `data`
  - `timeout`
  - `responseType`: `text`, `json`, `arraybuffer`, `blob`, `document`
  - `onload`
  - `onerror`
  - `onprogress`
  - `onreadystatechange`
  - `ontimeout`
  - `onabort`
  - `.abort()`
  - `anonymous` / credentials behavior
- Respect `@connect`.
- Return response object fields expected by TM/VM:
  - `status`
  - `statusText`
  - `finalUrl`
  - `responseHeaders`
  - `responseText`
  - `response`
  - `readyState`

Expected outcome:

- Scripts that rely on GM XHR behavior work much better than with fetch-only.

### Phase 6 - Realm Strategy And CSP Handling

Goal: support both page access and safer isolated execution.

Recommended minimal route:

- Default to `MAIN` world for scripts needing page JS access or `@grant none`.
- Use isolated content-world runtime for scripts with GM grants when page access is not required.
- Expose `unsafeWindow` for content-world scripts where feasible.
- If `MAIN` injection is blocked or too risky, fall back and log.

Do not start with full Violetmonkey vault/iframe sandbox. That is powerful but large and easy to break.

Later optional route:

- Add script tag injection with nonce support.
- Add a small page/content bridge similar to VM, but only after Phases 1-5 are stable.

Expected outcome:

- We get most compatibility while keeping implementation size controlled.

### Phase 7 - Admin And Backend Hardening

Goal: make backend-installed scripts reliable and diagnosable.

Changes:

- Add parser warnings/errors to admin userscript create/update responses.
- Show parsed metadata in admin UI.
- Show last sync status and last runtime errors.
- Add enable/disable per script without deleting file.
- Store script identity as namespace + name when available to avoid duplicate installs.
- Optionally add backend-side dependency prefetch for production deployments with restricted extension networking.

Expected outcome:

- Admin can paste a userscript, save it, and see whether it is installable/runnable before testing in browser.

## Minimal File Change Map

Likely new files:

- `extension/modules/userscript_matcher.js`
- `extension/modules/userscript_runtime.js`
- `extension/modules/userscript_gm_bridge.js`
- `extension/modules/userscript_spa_watcher.js`
- `extension/modules/userscript_types.js` or simple constants file
- `backend/app/core/userscript_utils.py` improved in place
- `tmp/userscript_engine_compat_tests.md` or real tests if we add test harness

Likely edited files:

- `extension/modules/userscript_engine.js`
- `extension/background.js`
- `extension/manifest.json`
- `extension/manifest_firefox.json`
- `backend/app/core/userscript_utils.py`
- `backend/app/api/routes.py`
- `backend/app/api/admin_routes/settings.py`

Do not edit unless needed:

- `extension/modules/captcha.js`
- `extension/modules/exam.js`
- `extension/modules/autofill.js`
- `extension/modules/stall_automation.js`
- `extension/modules/main_inject.js`
- `extension/modules/sarathi_harden.js`

## Compatibility Target

Good target for first stable release:

- 80 percent of ordinary userscripts that rely on:
  - `@match`
  - `@include`
  - `@exclude`
  - `@require`
  - `@resource`
  - `GM_addStyle`
  - `GM_getValue` / `GM_setValue`
  - `GM_xmlhttpRequest`
  - `unsafeWindow`
  - `document-start/end/idle`

Not target for first release:

- Full VM/TM editor/options UI.
- Script auto-update from GreasyFork/OpenUserJS.
- Cloud sync.
- Full CSP vault.
- Full cookie container routing.
- Full webRequest header rewriting for forbidden headers.
- Every edge-case TM-specific API.

## Biggest Risks

1. Document-start timing

Our content script loads at `document_start`, but waiting for backend sync or async dependency fetch can miss early page scripts. The fix is to pre-sync/cache scripts in background and make content runtime use local storage immediately.

2. `MAIN` world pollution

Running all scripts in page world gives compatibility but lets the page interfere with APIs and wrappers. The fix is a phased realm strategy.

3. Existing extension behavior

STALL and Sarathi logic rely on current `EXECUTE_IN_MAIN` behavior. Keep that path stable and add userscript-specific messages instead of replacing it.

4. MV3 service worker lifetime

Background state can disappear. Store script/cache/runtime state in `chrome.storage.local`, and design every message handler to reload what it needs.

5. Security

Backend-installed scripts are trusted by admin, but they can run on all pages and call network APIs. Keep API-key sync protected, validate script source, respect `@connect`, and log network attempts.

## Verification Plan

Create a small local userscript compatibility test set:

- Match/include/exclude routing test.
- `@run-at document-start` sets a marker before DOMContentLoaded.
- `@require` dependency creates a global function used by script.
- `@resource` CSS/image can be read by `GM_getResourceText` and `GM_getResourceURL`.
- `GM_getValue`/`GM_setValue` survives reload.
- `GM_addValueChangeListener` fires across two tabs.
- `GM_xmlhttpRequest` can GET JSON and call `onload`.
- `GM_xmlhttpRequest` respects blocked `@connect`.
- `@noframes` skips iframe.
- SPA route change reruns matching script once.

Expected terminal/browser verification:

- Extension build/package still succeeds.
- Backend starts and `/v1/userscripts/sync` returns scripts.
- Existing Sarathi/STALL modules still load with no runtime errors.
- Userscript logs show successful runs and clear errors for blocked dependencies/connects.

## Recommended Next Implementation Step

Start with Phase 1 and Phase 2 together, but keep edits small:

1. Add `userscript_matcher.js` with VM-inspired matcher behavior.
2. Update `userscript_engine.js` to use it and support `@include`, `@exclude-match`, and SPA rerun.
3. Keep execution bridge unchanged for the first patch.
4. Add tests or a tiny debug page to verify matching and run-at behavior.

After that is stable, proceed to GM API expansion and XHR compatibility.

