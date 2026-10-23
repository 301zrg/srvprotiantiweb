# Client preview implementation plan

> Agentic workers: implement the scoped tasks below, using meaningful regression tests and a final independent review. This is a preview-only change; do not merge or deploy the production branch.

**Goal:** Implement the user's approved 12-item client update and provide a Cloudflare non-production preview.

**Architecture:** Keep online server authority, read-only replay, and local practice response paths separate. Retain the existing React/store/protocol structure; share configuration and fixed runtime resources rather than changing the historical Core or production services.

**Tech stack:** React 18, TypeScript, Valtio, Ant Design, Vite, existing fixed 706 WASM/Lua, Playwright.

**Spec:** The 2026-10-19 assessment and the user's numbered approval in the conversation. The implementation details and acceptance criteria below are the maintained execution record; the assessment remains a proposal history.

## Constraints

- Baseline: production branch `deploy/cloudflare`, commit `7b636941a9c4ca85084f96972c8ec3dc2c7c715b`.
- Candidate: `codex/client-preview-20261019`; preserve the original dirty worktree.
- User permits Cloudflare preview build only. Never update or merge into `deploy/cloudflare`, never run `wrangler deploy`.
- Source-link visible label is exactly `srvprotiantiweb`, linked to `https://github.com/301zrg/srvprotiantiweb`.
- Persist complete nickname/room across browser restarts. Spectator link fields are one-shot and never clear/overwrite ordinary drafts.
- Random RPS defaults to suggestion; only a user click may submit a random response.
- Deck editor ignore-banlist mode still enforces three canonical copies and existing zone rules; server remains final authority.
- Practice fixes MR2 in environment configuration, controls both players, and ignores victory; no master-rule selector.
- All changed copy is reviewed before preview publication; retain Chinese/English/Japanese/Korean parity.

## Review focus

- Empty DECK/EXTRA/GRAVE/REMOVED must remain clickable and visibly show zero, including swapped spectator views.
- Imported decks, alternate art aliases and cross-zone moves must not evade copy limits or lose ordering.
- New pending requests invalidate old click responses on restart, tie, disconnect and mode change.
- Closing settings, rotating and opening details must not discard selections or change online identity.
- A successful preview build does not prove WSS origin permission, real-device gestures/audio, or a complete real match.

## Tasks and interfaces

### 1. Cached input and homepage
- Files: `src/variant/joinForm.ts`, `src/ui/Match/index.tsx`, `src/ui/Start/index.tsx`, `src/variant/links.ts`, related docs.
- Preserve `readJoinForm`, `saveJoinForm`, `clearJoinForm`; store a versioned full browser draft and retain per-tab overrides. Remove spectator cleanup writes.
- [x] Extend and run `scripts/test_join_form.mjs`: browser reopen, migration, clear, tabs, namespaces and blocked storage must distinguish old/new behavior.
- [x] Implement and run join-form and room-link regressions; verify source-link label.

### 2. Settings, RPS, messages and shared audio
- Files: setting store/UI, WaitRoom popover, effect RPS handler, HintNotification, MatStore default initialization. Replay UI audio toggle is owned by Task 4.
- Setting contracts: persisted chain mode, `randomRpsMode` = `off | suggest | play` (default suggest), `serverMessageMode` = `auto | popup | record`; single `audio.enableSoundEffects` authority.
- [x] Write/run focused state and request-lifecycle regressions before implementing; migrate legacy message/audio settings without re-enabling muted users.
- [x] Implement bidirectional live settings, four setting groups, compact portrait summaries and guarded random submissions.
- [x] Verify actual toggles, tie/reconnect behavior and stop-current-audio behavior.

### 3. Local practice
- Files: new `src/practice/`, `src/ui/Practice/`, runtime loader extraction from `src/replay/engine.ts`; own practice docs/tests.
- Produce `/practice` page export `Component`; root task owns router and editor entry. Share fixed verified runtime resources, never online response handlers.
- [x] Prove real Core responds for both players, retains MR2 first draw and continues after LP/deck/special victory.
- [x] Implement cancellable Worker with request ids, both-side actions, deterministic retry and fresh redeal.
- [x] Verify two different decks, response ownership during chains, restart cancellation and zero online packets.

### 4. Replay extraction and replay audio toggle
- Files: new extraction module/panel/tests, `src/ui/Replay/index.tsx`; no edits to practice or setting-store files.
- Consume verified runtime loader exported by Task 3. Parse replay body without running the duel or loading card/script resources solely to extract decks.
- [x] Write/run extraction tests with native fixtures, corrupt/unsupported files and unchanged main/extra ordering.
- [x] Implement per-player YDK/new-deck save and save-both; side stays empty with explicit explanation. Never overwrite existing decks.
- [x] Make replay audio read/write the canonical shared sound setting and verify immediate mute.

### 5. Deck editor filtering
- Files: `src/ui/BuildDeck/`, search condition types, new focused tests.
- [x] Write/run canonical-copy, cross-zone, ban categories and ignore-mode regressions.
- [x] Implement multi-select ban status and editor switch without sorting or changing server room settings.
- [x] Verify search/card-copy/drag/move routes and retained drafts on toggle/rotation.

### 6. Regions and duel layout
- Files: duel board geometry/styles/springs, zone list, main/sidebar; root owns these files.
- [x] Add meaningful browser fixture coverage for empty regions and hidden-deck content before changing interaction.
- [x] Implement a concealed main-deck view and uniform empty-zone clicks/counts; the fourth follow-up replaces its original count-only body with full card backs and authoritative face-up visibility.
- [x] Reflow wide board and fixed right information rail; preserve portrait, pending-choice dialogs, observer restrictions and current confirmation setting.
- [x] Verify 1440x900, 1280x800, 844x390, 568x320, 390x844, 320x640, all languages and relevant protocol selections/animations.

### 7. Integration and preview
- [x] Update only affected architecture/session/mobile/replay documentation and index entries.
- [x] Run TypeScript, source lint, static/Cloudflare build and focused regression suites. Inspect screenshots; distinguish synthetic/native/real-device evidence.
- [x] Independent review of the final diff; fix material findings and rerun affected checks.
- Release procedure: Commit/push candidate branch and create draft PR for Cloudflare preview, inspect exact commit status and preview URL.
- Release procedure: Recheck production source is unchanged; return preview link, tested scope and remaining real-device/full-match acceptance.

## Execution ledger

Eighth follow-up (2026-10-21): fix mixed-zone artwork bounds and original zone ordinals; make existing online chain-target state live in candidates and add missing native 83 presentation to independent practice. Existing localized Targeted and region labels are reused. User additionally authorized a custom test subdomain and required WSS reconfiguration. Use the independent read-only test-entry Worker at test.ocg1103nexus.com, fixed to the existing preview, with one exact gateway Origin addition and held-socket graceful-reload verification. The attempted apex-preview configuration was rejected by automatic approval and never executed; the independent entry leaves production routing and content unchanged. Record actual builds, checks and remaining mainland/real-device acceptance in the draft PR and ignored evidence.

Seventh follow-up (2026-10-21): user approved the position-based field-target design and its four-language copy. Share pure slot mapping/grid only; online retains server authority, hidden opponent cards and raw response indices, practice retains independent Worker state and its legitimate full visibility. Preserve five columns, empty slots and mirrored opponents; synchronize local draft with field markers and locate/minimize/back without sending input. Lifecycle tests cover request/connection replacement, fixed choices and stale owners. Keep the same named Cloudflare preview; production, server, Core and Lua remain outside scope. Exact build checks and live preview evidence belong to the draft PR and ignored acceptance files.

Sixth follow-up (2026-10-21): preserve the eight scoped fixes on the same preview. Reuse system text; the user approved the independent attack-declaration label only because the current system has none (`client-preview-timing-copy.md`). Implement result feedback, native event/timing context, battle substeps including observer damage-step exit, empty All Chain inspect/continue, temporary authoritative deck revelation, portrait minimized space, optional zero selection, and DOM-independent material depth. Keep the existing architecture boundaries; no Core/Lua/resource, server or production changes. Real Core, protocol UI, five-viewport material hit testing, practice spell/monster/trap and declaration localization cover distinct failure modes. Use the static production build for acceptance: the development server's CSS geometry differs. Exact source, cloud checks and remaining manual acceptance belong to the draft PR and ignored evidence.

Fourth follow-up: user authorized eight display/interaction fixes on the same named preview. Expand/collapse log labels in four languages were explicitly confirmed on 2026-10-20; other text reuses approved copy. Repair the right-aligned replay action, duplicate practice audio, generic S/T set label, effect-placeholder formatting, LP/hand separation, live/practice material display and detach indices, usable landscape log panel and compact pass-through feedback, practice history, portrait action-first inspection, and authoritative face-up deck display. New entrypoints are `test_practice_presentation.mjs`, `test_deck_visibility.mjs` and `client_round4_ui.mjs`. No Core/Lua, server, production branch or origin configuration changes are authorized or needed.

Third follow-up remains preview-only. User approved the five four-language rows and the separate pile-order explanation in `client-preview-followup-copy.md`. Repair nonempty-pile label depth, short-landscape controls, dismissible/7-second replay receipts, fixed-length ID masking and played/outcome RPS notices. Practice normal-spell count=0 placement and hidden off-board choices were reproduced with Pot of Duality; cover actual spell/set/monster/trap continuation, all supported native response message types, both-pile inspection and current order. Exact final results belong to the draft PR and ignored acceptance evidence.

Second review: user authorized five corrections on the same preview and explicitly confirmed fixed A-bottom/B-top, both hands/facedown visible, responding player follows Core without flipping view. Four-language text in `client-preview-revision-copy.md` was confirmed. Practice directly starts from the draft/local deck; card menus, field targets/positions, six-phase controls and confirmation drive the real Core. Targeted RED/GREEN covers count preference migration, formerly clickable first-turn phase items, absent direct-entry interactive board, and the original reversed Rock/Scissors effect codes. Both RPS paths follow 706 scissors=1, rock=2, paper=3. Browser entrypoints are `client_revision_ui.mjs`, `practice_duel_ui.mjs` (also through `practice_ui.mjs`) and updated `practice_editor_roundtrip_ui.mjs`. Exact final checks belong to the draft PR; production remains excluded.

- 2026-10-19: Production remote ref verified read-only. Created an isolated candidate from `7b636941`; no changes to original worktree or production branch.

- Local verification: TypeScript; 59 changed-source ESLint files; Cloudflare static build with immutable resource checks; normal-build desktop/mobile smoke.
- Focused regressions: exact browser/tab cache and room-link restoration; settings/RPS/message/audio state; native replay extraction; editor ban filters and three-copy limits; four real Worker practice viewports and retained editor draft.
- Duel UI: 20 four-language lobby/duel profiles, five empty-region/geometry profiles, and 27 native-response tribute selection cases. Screenshots inspected; all use synthetic local transport and Edge touch emulation.
- Independent review found a practice sort encoding error. A three-distinct-card, non-self-inverse native Core regression demonstrated RED, then GREEN after encoding destination ranks. No other material finding remains.
- Publication is preview-only. Exact candidate SHA, Cloudflare result and URL are recorded in the draft PR checks; production remains outside this release. Real Android/iOS, full public matches and long-running live-game acceptance remain manual.
- Follow-up authorized by the user: retain the existing named preview across future branches, obtain its WSS from published production metadata at build time, and append only that exact preview Origin to the Nginx gateway. Validate configuration, preserve a self-created WebSocket across a graceful reload, and recheck production source; do not restart game, PM2 or tunnel processes. Recovery after unrelated disconnects remains bounded by existing reconnect and retention windows.
