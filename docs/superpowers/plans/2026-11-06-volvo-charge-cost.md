# Volvo Charge Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private household PWA that shows the Volvo XC40/C40 Recharge's state, prices every Zaptec home-charging session with Fortum spot + Nacka Energi grid tariffs, and recommends the cheapest charging window.

**Architecture:** pnpm workspace copied from `/Users/pedro/repos/frescati`: Next.js 15 frontend on Vercel reading Firestore directly, Firebase Cloud Functions v2 for polling, pricing writes, pushes and the Volvo OAuth callback, and a pure `shared/` TypeScript directory holding all pricing/planning logic. Providers: elprisetjustnu.se (spot), Zaptec cloud API (energy), Volvo Connected Vehicle / Energy / Location APIs (car).

**Tech Stack:** Node 24, pnpm 10, TypeScript 5.9, Next.js 15 App Router, React 19, StyleX, Firebase (Auth, Firestore, Functions v2, FCM), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-volvo-charge-cost-design.md`. Read it before starting any task; section numbers below (§n) refer to it.

## Global Constraints

- Run `nvm use` (reads `.nvmrc` = `24.16.0`) before any Node/pnpm command. Package manager is pnpm (`packageManager: "pnpm@10.34.1"`).
- The owner's shell exports `npm_config_registry` pointing at a private registry. Prefix every install with `npm_config_registry=https://registry.npmjs.org/`.
- Dependency versions: use the exact versions in `/Users/pedro/repos/frescati/package.json`, `frontend/package.json`, `backend/package.json` for any package both repos use. Add no UI/chart/date libraries; dates use `Intl` and plain `Date`.
- Functions region `europe-west1`, runtime `nodejs24`. Vercel project name `volvo-calc-charger`. Firebase project id read from `.firebaserc` (owner creates it; default `volvo-calc-charger`).
- Time zone for every "local" rule: `Europe/Stockholm`. Every stored timestamp is an ISO string in UTC (`...Z`), except `prices/*` quarter `start`, which keeps the source's offset.
- All tariff money values are stored **excluding VAT**; VAT applied once with `tariff.vatRate` (0.25).
- No remote unlock anywhere: never request scope `conve:unlock`, never call an unlock endpoint.
- Never store Zaptec's `userEmail`, `userFullName`, `userUserName`, installation address, or Volvo VIN in client-readable documents except `car/state.vinLast4`.
- Secrets only via Firebase Secret Manager (`defineSecret`); never in the repo, never in client-readable Firestore docs.
- UI: phone first, permanently dark, colours only from `frontend/app/tokens.stylex.ts`.
- Money shown as `sv-SE` with 2 decimals and `kr`; energy with 1 decimal and `kWh`.
- Commit after every task with a conventional message; end every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WmWcEaDMrkpxESZQU4LDDf
  ```

## Review Focus

1. **DST days.** 2026-10-25 has 100 quarter prices and a 25-hour day; 2027-03-28 has 92. Pricing, high-load checks and the planner must key on UTC hours and convert to local only for rules. Pinned in Task 5 and Task 10.
2. **A session crossing midnight local time** reads prices from two `prices/{date}` docs, where the date is the **local** date of each hour (23:00Z on 2 Nov is 00:00 on 3 Nov local). Pinned in Task 8.
3. **Sparse Zaptec energy details.** A two-entry session spanning several hours must spread energy evenly, not dump it into one hour and fake a 30 kW peak. Pinned in Task 7.
4. **Volvo refresh-token rotation under overlap.** Two invocations refreshing at once must not both spend the same refresh token. Pinned in Task 4 (transaction + test with concurrent calls).
5. **Re-pricing is idempotent.** `pollZaptec` re-reads the same sessions every 5 minutes and `fetchPrices` re-prices pending ones; neither may send a second "session done" push or double-count a session in `peaks/{month}`. Pinned in Task 14.

---

## File Structure

```
package.json, pnpm-workspace.yaml, .nvmrc, .npmrc, .prettierrc.json, .prettierignore, tsconfig.json,
vitest.config.ts, firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
shared/
  types.ts           all domain types shared by backend and frontend
  time.ts            UTC/local helpers, hour arithmetic, Stockholm local parts
  prices.ts          elprisetjustnu parsing, hourly spot average, price-doc date for an hour
  tariff.ts          tariff selection by date, high-load test, VAT helpers
  zaptec.ts          Zaptec session parsing → Session (UTC fix, hour spreading)
  pricing.ts         hour rate, session cost breakdown, live cost-so-far
  peaks.ts           monthly top-3 and fee share
  planner.ts         tonight's recommendation
  insights.ts        kr/100 km, petrol comparison, monthly totals
  volvo.ts           Volvo response parsers → CarState
  alerts.ts          left-open issues, reconnect timing, push dedupe keys
  format.ts          kr / kWh / relative-time formatting (sv-SE)
rules/firestore.test.ts, rules/vitest.config.ts
backend/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts
  src/lib/firebase.ts        admin app, db, REGION
  src/lib/secrets.ts         defineSecret declarations
  src/lib/allowlist.ts       assertAllowed(auth)
  src/lib/push.ts            sendPush(kind, title, body, dedupeKey)
  src/providers/elpriset.ts  fetchPriceDay(date, fetch)
  src/providers/zaptec.ts    createZaptecClient
  src/providers/volvoAuth.ts PKCE, code exchange, getAccessToken (rotation-safe)
  src/providers/volvo.ts     createVolvoClient (reads + commands)
  src/fetchPrices.ts, src/pollZaptec.ts, src/pollCar.ts, src/planTonight.ts,
  src/volvoOAuth.ts (volvoAuthStart, volvoCallback), src/commands.ts
  scripts/allow.ts           add an email to config/allowlist
  scripts/captureVolvo.ts    record real Volvo responses into fixtures
  scripts/seed.ts            emulator seed for dev + e2e
  test/fixtures/{elpriset,zaptec,volvo}/*.json
  test/*.test.ts
frontend/
  app/layout.tsx, app/globals.css, app/tokens.stylex.ts
  app/(public)/terms/page.tsx, app/(public)/privacy/page.tsx
  app/(app)/layout.tsx (auth gate + tabs), app/(app)/page.tsx (Home),
  app/(app)/car/page.tsx, app/(app)/history/page.tsx, app/(app)/history/[id]/page.tsx,
  app/(app)/settings/page.tsx
  components/  BatteryBar, TonightCard, PriceChart, CommandButtons, StatusRow, SessionRow,
               MonthSummary, TariffEditor, AllowlistEditor, VolvoConnection, Tabs, Banner
  lib/firebaseClient.ts, lib/auth.tsx, lib/push.ts, lib/useDoc.ts, lib/useCollection.ts
  public/manifest.json, public/sw.js, public/offline.html, public/icon-*.png
  next.config.js, vercel.json
e2e/ home.spec.ts, history.spec.ts, settings.spec.ts, fixtures.ts
playwright.config.ts
```

---

### Task 1: Workspace and shared types

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml` (packages `frontend`, `backend`), `.nvmrc`, `.npmrc`, `.prettierrc.json`, `.prettierignore`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `shared/types.ts`, `shared/types.test.ts`

**Interfaces:**
- Produces (`shared/types.ts`), used by every later task:

```ts
export type IsoUtc = string; // always ends in 'Z'
export interface PriceQuarter { start: string; sekPerKwhExVat: number } // start keeps source offset
export interface PriceDay { date: string; quarters: PriceQuarter[] } // date = local YYYY-MM-DD
export interface HighLoad { months: number[]; weekdaysOnly: boolean; fromHour: number; toHour: number }
export interface Tariff {
  id: string; effectiveFrom: string; vatRate: number; energyTaxPerKwh: number;
  fortum: { markupPerKwh: number; monthlyFee: number };
  nacka: { fixedPerYear: number; transferLowPerKwh: number; transferHighPerKwh: number;
           peakPerKwMonth: number; highLoad: HighLoad };
}
export interface SessionHour { hourStartUtc: IsoUtc; kWh: number }
export interface Session { id: string; startUtc: IsoUtc; endUtc: IsoUtc; kWh: number; hours: SessionHour[] }
export interface CostBreakdown { spot: number; markup: number; transfer: number; energyTax: number; vat: number; total: number }
export interface PlanCandidate { kw: number; start: IsoUtc; end: IsoUtc; energyCost: number; peakIncrease: number; cost: number }
export interface Plan { date: string; batteryPercent: number; neededKwh: number; basis: 'today' | 'tomorrow';
  chargeNow: boolean; recommendation: PlanCandidate | null; alternative: PlanCandidate | null }
export interface PricedSession extends Session { status: 'priced' | 'pending'; cost: CostBreakdown | null;
  peakShare: number; planned: Pick<PlanCandidate, 'kw' | 'start' | 'end' | 'cost'> | null }
export interface PeakHour { hourStartUtc: IsoUtc; kW: number; sessionId: string }
export interface MonthPeaks { month: string; top3: PeakHour[]; estimatedFee: number; final: boolean }
export interface Settings { targetPercent: number; readyBy: string; usableBatteryKwh: number;
  chargingEfficiency: number; chargerMaxKw: number; reducedKw: number;
  petrol: { litresPer100km: number; krPerLitre: number };
  notifications: { plugIn: boolean; sessionDone: boolean; leftOpen: boolean } }
export interface ChargerState { pluggedIn: boolean; charging: boolean; liveKw: number; sessionKwh: number; updatedAt: IsoUtc }
export interface Timed<T> { value: T; at: IsoUtc }
export interface CarState {
  vinLast4: string;
  battery: Timed<{ percent: number; rangeKm: number; chargingStatus: string; estFullAt: IsoUtc | null }> | null;
  locked: Timed<boolean> | null;
  openings: Timed<Record<string, 'open' | 'closed'>> | null; // keys: door:frontLeft, window:rearLeft, tailgate, hood, sunroof...
  tyres: Timed<Record<string, string>> | null; warnings: Timed<string[]> | null;
  service: Timed<{ status: string; distanceKm: number | null; days: number | null }> | null;
  odometerKm: Timed<number> | null; location: Timed<{ lat: number; lng: number }> | null;
  updatedAt: IsoUtc;
}
export const DEFAULT_SETTINGS: Settings; // values from spec §5: 80, "07:00", 75, 0.9, 11, 3.7, petrol {7.5, 18}, all notifications true
```

- [ ] **Step 1:** Copy root config shape from frescati (`tsconfig.json` with `@shared/*` path and `include: ["shared","e2e","rules","*.ts"]`; `vitest.config.ts` running `shared/**/*.test.ts` with istanbul coverage, thresholds **statements 95, branches 90, functions 95, lines 95**). Root scripts: `test`, `test:backend`, `test:rules`, `test:e2e`, `typecheck`, `lint`, `format`, `emulators`, `seed`, `dev`, `dev:seeded`, `build`, `preinstall: npx only-allow pnpm`.
- [ ] **Step 2: Failing test** `shared/types.test.ts`: `DEFAULT_SETTINGS` equals the spec values exactly (`targetPercent 80`, `readyBy '07:00'`, `usableBatteryKwh 75`, `chargingEfficiency 0.9`, `chargerMaxKw 11`, `reducedKw 3.7`).
- [ ] **Step 3:** Run `pnpm test` → FAIL (module missing). Write `shared/types.ts`. Run → PASS.
- [ ] **Step 4:** `pnpm install` (with registry prefix) succeeds; `pnpm typecheck:root` passes.
- [ ] **Step 5: Commit** `chore: scaffold workspace and shared types`.

### Task 2: Frontend shell, PWA, auth gate, public terms/privacy — first deploy

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.js`, `frontend/vercel.json`, `frontend/vitest.config.ts`, `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/app/tokens.stylex.ts`, `frontend/app/(public)/terms/page.tsx`, `frontend/app/(public)/privacy/page.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/(app)/page.tsx` (placeholder "Home"), `frontend/components/Tabs.tsx`, `frontend/lib/firebaseClient.ts`, `frontend/lib/auth.tsx`, `frontend/public/{manifest.json,sw.js,offline.html,icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png}`
- Test: `frontend/lib/auth.test.tsx`, `frontend/app/(public)/terms/page.test.tsx`

**Interfaces:**
- Produces: `getFirebaseApp()`, `getDb()`, `getAuthClient()` from `frontend/lib/firebaseClient.ts`; `AuthProvider`, `useAuth(): { user: User | null; allowed: boolean | null; signIn(): Promise<void>; signOut(): Promise<void> }` from `frontend/lib/auth.tsx`. `allowed` is `null` while checking, `false` when the signed-in email is not in `config/allowlist` (read fails with permission-denied).
- Produces: `Tabs` with routes `/`, `/car`, `/history`, `/settings`.

- [ ] **Step 1:** Scaffold Next.js 15 + StyleX exactly as frescati (`next.config.js` StyleX plugin, `tokens.stylex.ts` with `colors`/`tint`, dark only). Copy frescati's `sw.js` caching strategy, trimmed to: precache `offline.html` + icons, network-first for navigations with offline fallback, and a `push`/`notificationclick` handler (used in Task 22). `manifest.json`: name "Volvo Charge", short_name "Charge", `display: standalone`, dark theme/background colours from tokens.
- [ ] **Step 2:** `next.config.js` `rewrites()`: `/api/volvo/callback` → `https://europe-west1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/volvoCallback`.
- [ ] **Step 3: Failing tests.** `terms/page.test.tsx`: renders headings and contains the strings `lock`, `climate`, `never unlocks`, `europe-west1`, `Volvo ID`, `estimates`, `pedrotari7@gmail.com`. `auth.test.tsx`: with a mocked Firestore read that rejects `permission-denied`, `allowed` becomes `false` and the `(app)` layout renders "This account is not allowed" with a sign-out button; with a resolving read, renders children.
- [ ] **Step 4:** Run `pnpm --filter frontend test` → FAIL. Implement pages per spec §7 "Public" (terms) and a privacy page listing: data read (from the Volvo scopes in spec §3), where stored, retention (until disconnect), how to revoke and request deletion. Implement auth gate. Run → PASS.
- [ ] **Step 5:** `pnpm --filter frontend build` succeeds.
- [ ] **Step 6: Owner action (stop and ask the owner):** create Firebase project (Blaze), enable Google sign-in, create web app config → `frontend/.env.local` and Vercel env vars (`NEXT_PUBLIC_FIREBASE_*`); create Vercel project `volvo-calc-charger` linked to `frontend/`; deploy. Verify `https://volvo-calc-charger.vercel.app/terms` and `/privacy` load signed-out. Owner then submits the Volvo app for publishing.
- [ ] **Step 7: Commit** `feat(frontend): PWA shell, auth gate, terms and privacy`.

### Task 3: Backend scaffold, Firestore rules, allowlist script

**Files:**
- Create: `backend/package.json` (main `lib/backend/src/index.js`), `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/src/index.ts`, `backend/src/lib/{firebase.ts,secrets.ts,allowlist.ts}`, `backend/scripts/allow.ts`, `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `rules/vitest.config.ts`, `rules/firestore.test.ts`, `scripts/emulators.sh` (copy frescati's, JDK 21 lookup)
- Test: `rules/firestore.test.ts`, `backend/test/allowlist.test.ts`

**Interfaces:**
- Produces: `db`, `REGION = 'europe-west1'` (`lib/firebase.ts`); secrets `ZAPTEC_USERNAME, ZAPTEC_PASSWORD, VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET, VOLVO_API_KEY` (`lib/secrets.ts`); `assertAllowed(auth: CallableRequest['auth']): Promise<string>` returns the email or throws `HttpsError('permission-denied')` (`lib/allowlist.ts`).
- Produces: `pnpm --filter backend allow <email>` adds the email to `config/allowlist.emails` (arrayUnion), against the emulator if `FIRESTORE_EMULATOR_HOST` is set, else the real project.

- [ ] **Step 1: Failing rules tests** (`@firebase/rules-unit-testing`, project `demo-volvo`), with `config/allowlist = {emails: ['me@x.se']}` seeded:
  - `me@x.se` (email_verified) can read `car/state`, `sessions/a`, `prices/2026-11-03`, `plans/2026-11-03`, `peaks/2026-11`, `charger/state`, `config/settings`, `tariffs/t1`.
  - `me@x.se` can write `config/settings`, `tariffs/t1`, `config/allowlist`, `users/{ownUid}/pushTokens/tok`; cannot write `sessions/a`, `car/state`, `plans/x`, `peaks/x`, `prices/x`, `charger/state`, `users/{otherUid}/pushTokens/tok`.
  - `me@x.se` can read `status/zaptec` and `status/volvo`; cannot write them.
  - `me@x.se` cannot read or write `private/volvo`, `private/volvoAuth`, `private/notified`.
  - `stranger@x.se` cannot read `car/state`; can read nothing at all except failing.
  - Unverified `me@x.se` cannot read `car/state`.
- [ ] **Step 2:** Run `pnpm test:rules` → FAIL. Write `firestore.rules` (`isAllowed()` = signed in, `email_verified`, email in `get(/databases/$(database)/documents/config/allowlist).data.emails`). Run → PASS.
- [ ] **Step 3: Failing test** `backend/test/allowlist.test.ts` (emulator): `assertAllowed` resolves `'me@x.se'` for an allowed verified token; throws `permission-denied` for a missing auth, an unverified email, and an email not in the list.
- [ ] **Step 4:** Implement; `pnpm test:backend` → PASS; `pnpm --filter backend build` succeeds.
- [ ] **Step 5:** Deploy rules (`firebase deploy --only firestore`). **Owner action:** run `pnpm --filter backend allow <your email>` against the real project and sign in on the deployed app; Home placeholder shows.
- [ ] **Step 6: Commit** `feat(backend): scaffold, firestore rules, allowlist`.

### Task 4: Volvo OAuth (start, callback, rotation-safe tokens) and capture

**Files:**
- Create: `backend/src/providers/volvoAuth.ts`, `backend/src/volvoOAuth.ts`, `backend/scripts/captureVolvo.ts`, `backend/test/volvoAuth.test.ts`, `backend/test/fixtures/volvo/*.json`
- Modify: `backend/src/index.ts` (export `volvoAuthStart`, `volvoCallback`)

**Interfaces:**
- Consumes: `assertAllowed`, secrets, `db`.
- Produces (`providers/volvoAuth.ts`):
  - `VOLVO_SCOPES: string` — exactly the 26 scopes in spec §3, space-separated.
  - `AUTH_URL`, `TOKEN_URL` — the `auth.volvocars.com` endpoints in spec §3.
  - `REDIRECT_URI = 'https://volvo-calc-charger.vercel.app/api/volvo/callback'`.
  - `buildAuthorizeUrl(clientId: string, state: string, codeChallenge: string): string`
  - `createPkcePair(): { verifier: string; challenge: string }` (verifier 64 chars from the unreserved set; challenge = base64url(sha256), no padding).
  - `exchangeCode(code: string, verifier: string, creds: {clientId: string; clientSecret: string}, fetchFn = fetch): Promise<TokenSet>`
  - `getAccessToken(creds, fetchFn = fetch, now = () => new Date()): Promise<string>` — reads `private/volvo`; if `accessExpiresAt - 60 s > now` returns the stored token; otherwise refreshes **inside a Firestore transaction** that re-reads the doc, and if another invocation already refreshed (expiry now in the future) returns that token without calling Volvo; on success writes `refreshToken, accessToken, accessExpiresAt` atomically; on HTTP 400/401 writes `lastRefreshError` to `private/volvo` and `status/volvo {connected: false, lastRefreshError}` and throws `VolvoReconnectRequired`.
  - `type TokenSet = { accessToken: string; refreshToken: string; expiresIn: number }`
- Produces (`volvoOAuth.ts`): callable `volvoAuthStart` → `{ url }`, stores `private/volvoAuth {verifier, state, expiresAt: now+10min}`; HTTPS `volvoCallback` validates `state` and expiry, exchanges, writes `private/volvo {…tokens, grantStartedAt: now}` and the client-readable `status/volvo {connected: true, grantStartedAt, lastRefreshError: null}`, deletes `private/volvoAuth`, redirects 302 to `https://volvo-calc-charger.vercel.app/settings?volvo=connected` (or `?volvo=error&reason=<code>`).

- [ ] **Step 1: Failing tests** (emulator, `fetchFn` stubbed):
  - `buildAuthorizeUrl` contains `response_type=code`, `code_challenge_method=S256`, the redirect URI URL-encoded, and **does not contain `conve:unlock`**.
  - `createPkcePair`: verifier length 64 and matches `/^[A-Za-z0-9\-._~]+$/`; challenge equals base64url(sha256(verifier)) without `=`.
  - `exchangeCode` sends `Authorization: Basic base64(id:secret)`, body has `grant_type=authorization_code`, `code_verifier`.
  - `getAccessToken` with a fresh token makes zero fetch calls.
  - `getAccessToken` with an expired token: **two concurrent calls** result in exactly **one** refresh fetch, both resolve to the same new access token, and `private/volvo.refreshToken` equals the rotated token from the stub.
  - Refresh returning 400 `invalid_grant` → throws `VolvoReconnectRequired`, `lastRefreshError` set.
  - `volvoCallback` with a wrong `state` → 302 to `?volvo=error&reason=state`, nothing written to `private/volvo`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Implement `scripts/captureVolvo.ts`: uses `getAccessToken` against the real project and writes raw JSON for `GET /connected-vehicle/v2/vehicles`, `/{vin}`, `/{vin}/doors`, `/{vin}/windows`, `/{vin}/odometer`, `/{vin}/tyres`, `/{vin}/warnings`, `/{vin}/statistics`, `/{vin}/diagnostics`, `/{vin}/commands`, `/{vin}/command-accessibility`, `GET /energy/v2/vehicles/{vin}/state`, `GET /energy/v2/vehicles/{vin}/capabilities`, `GET /location/v1/vehicles/{vin}/location` into `backend/test/fixtures/volvo/<name>.json`, replacing the VIN with `YV1TESTVIN0000001` and coordinates with `59.3100, 18.1600` before writing.
- [ ] **Step 4:** Deploy functions + secrets (`firebase functions:secrets:set …` — **owner enters values**). Add a temporary "Connect Volvo" button to the Home placeholder calling `volvoAuthStart` and navigating to `url`. **Owner action:** sign in with Volvo ID, tick "Remember me". Then run `pnpm --filter backend capture-volvo`.
- [ ] **Step 5:** If sign-in fails with an unpublished-app error, record that in `docs/volvo-status.md`, create doc-shaped fixtures for the same endpoint list from developer.volvocars.com, and continue; re-run Step 4 after Volvo approves the app.
- [ ] **Step 6: Commit** `feat(backend): Volvo OAuth with rotation-safe refresh and response capture`.

### Task 5: Time helpers

**Files:** Create `shared/time.ts`, `shared/time.test.ts`

**Interfaces:**
- Produces:
  - `floorHourUtc(iso: string): IsoUtc`
  - `addHours(iso: IsoUtc, n: number): IsoUtc`
  - `localParts(iso: string): { date: string; hour: number; weekday: number; month: number }` — Europe/Stockholm; `weekday` 1=Mon…7=Sun; `month` 1–12.
  - `localDateOf(iso: string): string` — `YYYY-MM-DD` local.
  - `utcHoursBetween(startIso: string, endIso: string): IsoUtc[]` — every UTC hour start overlapped by [start, end).
  - `nextLocalTime(nowIso: IsoUtc, hhmm: string): IsoUtc` — next instant at local `hh:mm` strictly after now.
  - `monthKey(iso: string): string` — local `YYYY-MM`.

- [ ] **Step 1: Failing tests:**
  - `localParts('2026-11-02T23:00:00Z')` → `{date:'2026-11-03', hour:0, weekday:2, month:11}`.
  - `localParts('2026-07-01T10:00:00Z').hour` → `12` (CEST).
  - `utcHoursBetween('2026-11-02T23:02:05Z','2026-11-03T01:30:00Z')` → `['2026-11-02T23:00:00.000Z','2026-11-03T00:00:00.000Z','2026-11-03T01:00:00.000Z']`.
  - `nextLocalTime('2026-11-03T08:00:00Z','07:00')` → `'2026-11-04T06:00:00.000Z'`; `nextLocalTime('2026-03-28T20:00:00Z','07:00')` → `'2026-03-29T05:00:00.000Z'` (DST starts overnight).
  - `utcHoursBetween` over local 2026-10-25 00:00–24:00 (`'2026-10-24T22:00:00Z'`–`'2026-10-25T23:00:00Z'`) has length 25.
  - `monthKey('2026-10-31T23:30:00Z')` → `'2026-11'`.
- [ ] **Step 2:** Run → FAIL. Implement with `Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm', …}).formatToParts`. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): Stockholm time helpers`.

### Task 6: Prices and tariffs

**Files:** Create `shared/prices.ts`, `shared/tariff.ts`, their tests, `backend/test/fixtures/elpriset/2026-11-03_SE3.json` (96 rows, real shape `{SEK_per_kWh, EUR_per_kWh, EXR, time_start, time_end}`), `shared/testdata.ts` (exports `TEST_TARIFF` below for all shared tests)

**Interfaces:**
- Produces (`prices.ts`):
  - `parseElpriset(date: string, rows: unknown): PriceDay` — throws on non-array or rows missing `SEK_per_kWh`/`time_start`.
  - `spotForHour(days: Record<string, PriceDay>, hourStartUtc: IsoUtc): number | null` — mean of quarters whose `start` falls in the hour, from `days[localDateOf(hour)]`; `null` if the doc is missing or has fewer than 1 quarter in that hour.
  - `priceDocDatesFor(hours: IsoUtc[]): string[]` — distinct local dates needed.
- Produces (`tariff.ts`):
  - `selectTariff(tariffs: Tariff[], hourStartUtc: IsoUtc): Tariff | null` — latest `effectiveFrom` ≤ local date.
  - `isHighLoad(hl: HighLoad, hourStartUtc: IsoUtc): boolean` — local month in `months`, weekday Mon–Fri if `weekdaysOnly`, `fromHour ≤ local hour < toHour`.
  - `exVat(incl: number, vatRate: number): number`, `inclVat(ex: number, vatRate: number): number`.
- `TEST_TARIFF` (`shared/testdata.ts`): `{ id:'t1', effectiveFrom:'2026-01-01', vatRate:0.25, energyTaxPerKwh:0.36, fortum:{markupPerKwh:0.05, monthlyFee:39.2}, nacka:{fixedPerYear:2644.8, transferLowPerKwh:0.0736, transferHighPerKwh:0.2944, peakPerKwMonth:45.216, highLoad:{months:[1,2,3,11,12], weekdaysOnly:true, fromHour:6, toHour:22}} }` — a test fixture only, not the owner's real tariff.

- [ ] **Step 1: Failing tests:**
  - `parseElpriset` on the fixture → 96 quarters, first `{start:'2026-11-03T00:00:00+01:00', sekPerKwhExVat: <first SEK_per_kWh>}`.
  - `spotForHour` with day `2026-11-03` quarters at 00:00/15/30/45 local of `0.8` each → `spotForHour(days,'2026-11-02T23:00:00.000Z')` = `0.8`; with doc missing → `null`.
  - A 100-quarter DST day (2026-10-25: two 02:00 local hours) yields a distinct average for `2026-10-25T00:00:00.000Z` and `2026-10-25T01:00:00.000Z`.
  - `selectTariff` with `t1 (2026-01-01)` and `t2 (2026-07-01)`: June hour → t1, `2026-06-30T22:30:00Z` (local 1 July) → t2, `2025-12-31T12:00:00Z` → `null`.
  - `isHighLoad`: `2026-11-03T05:00:00Z` (Tue 06 local) → true; `2026-11-03T04:00:00Z` → false; `2026-11-03T21:00:00Z` (22 local) → false; `2026-11-07T10:00:00Z` (Sat) → false; `2026-07-01T10:00:00Z` → false; `2027-03-29T04:00:00Z` (Mon 06 CEST) → true.
  - `exVat(0.092, 0.25)` → `0.0736`; `inclVat(45.216, 0.25)` → `56.52`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): spot prices and tariff selection`.

### Task 7: Zaptec session parsing

**Files:** Create `shared/zaptec.ts`, `shared/zaptec.test.ts`, `backend/test/fixtures/zaptec/chargehistory.json` (anonymised: the five sessions from the spike with `userEmail/userFullName/userUserName/deviceName` replaced by `"x"`; first session's `energyDetails` exactly as recorded: `[{Timestamp:'2026-11-02T23:02:04.856+00:00',Energy:0},{Timestamp:'2026-11-03T00:00:00.179+00:00',Energy:9.930000000000064},{Timestamp:'2026-11-03T01:00:00.082+00:00',Energy:2.0109999999999673},{Timestamp:'2026-11-03T08:30:39.013+00:00',Energy:0}]`, `startDateTime:'2026-11-02T23:02:05.187'`, `endDateTime:'2026-11-03T08:30:39.31'`, `energy:11.941`)

**Interfaces:**
- Produces:
  - `parseZaptecTime(s: string): IsoUtc` — appends `Z` when there is no offset; normalises to `toISOString()`.
  - `parseZaptecSessions(page: unknown): Session[]` — accepts PascalCase or camelCase keys; drops sessions with `energy <= 0`; builds `hours` by spreading each detail interval (previous timestamp or session start → this timestamp) across overlapped UTC hours proportional to overlap; rounds each hour to 3 decimals; drops 0-kWh hours. Never reads personal fields.

- [ ] **Step 1: Failing tests:**
  - `parseZaptecTime('2026-11-02T23:02:05.187')` → `'2026-11-02T23:02:05.187Z'`; with `+00:00` suffix → same.
  - Fixture → 4 sessions (the 0.0 kWh one removed); first is `{id, startUtc:'2026-11-02T23:02:05.187Z', endUtc:'2026-11-03T08:30:39.310Z', kWh:11.941, hours:[{hourStartUtc:'2026-11-02T23:00:00.000Z',kWh:9.93},{hourStartUtc:'2026-11-03T00:00:00.000Z',kWh:2.011}]}`.
  - Sparse session: start `2026-11-04T20:00:00`, details `[{Timestamp:'2026-11-04T20:00:00+00:00',Energy:0},{Timestamp:'2026-11-04T23:00:00+00:00',Energy:30}]` → three hours of `10` kWh each.
  - Parsed output has no key named `userEmail`, `userFullName`, `deviceName` (check `JSON.stringify`).
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): parse Zaptec sessions into UTC hours`.

### Task 8: Session pricing

**Files:** Create `shared/pricing.ts`, `shared/pricing.test.ts`

**Interfaces:**
- Consumes: `spotForHour`, `selectTariff`, `isHighLoad`, `TEST_TARIFF`.
- Produces:
  - `hourRateExVat(hourStartUtc: IsoUtc, days: Record<string, PriceDay>, tariffs: Tariff[]): { spot: number; markup: number; transfer: number; energyTax: number; tariff: Tariff } | null` — `null` if spot or tariff missing.
  - `priceSession(s: Session, days: Record<string, PriceDay>, tariffs: Tariff[]): { status: 'priced' | 'pending'; cost: CostBreakdown | null }` — breakdown parts ex-VAT, `vat` = sum × vatRate of the tariff of each hour, `total` incl. VAT; `pending` with `cost: null` if any hour is missing a rate.
  - `allInRateInclVat(hourStartUtc, days, tariffs): number | null` — used for live "cost so far" (`sessionKwh × rate of the current hour`).

- [ ] **Step 1: Failing tests** — worked example from the real 2–3 Nov session with `TEST_TARIFF`, day `2026-11-03` having all four quarters of local 00:00 at `0.80` and of local 01:00 at `0.60, 0.62, 0.58, 0.60`:
  - `priceSession(firstFixtureSession)` → `status 'priced'`, `spot ≈ 9.1506`, `markup ≈ 0.59705`, `transfer ≈ 0.8788576`, `energyTax ≈ 4.29876`, `vat ≈ 3.7313169`, `total ≈ 18.6565845` (`toBeCloseTo(_, 4)`). Both hours are low-load (local 00 and 01).
  - Same session with `2026-11-03` doc absent → `{status:'pending', cost:null}`.
  - A session hour at `2026-11-03T06:00:00Z` (07 local Tue) uses `transferHighPerKwh 0.2944`.
  - A session spanning the 2026-06-30/07-01 local boundary with tariffs t1/t2 uses each tariff for its own hours.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): price sessions per hour`.

### Task 9: Peak fee estimate

**Files:** Create `shared/peaks.ts`, `shared/peaks.test.ts`

**Interfaces:**
- Produces:
  - `computeMonthPeaks(month: string, sessions: Session[], tariff: Tariff): MonthPeaks` — every session hour whose `monthKey` is `month`; `kW = kWh` of that clock hour; `top3` = three highest (tie → earlier hour); `estimatedFee = (Σ top3.kW / 3) × peakPerKwMonth × (1 + vatRate)`; `final: false`.
  - `peakShares(peaks: MonthPeaks): Record<string, number>` — sessionId → kr, split by kW contribution to `top3`.
  - `peakIncrease(peaks: MonthPeaks, extraHours: SessionHour[], tariff: Tariff): number` — fee with `extraHours` added minus current fee (≥ 0).

- [ ] **Step 1: Failing tests** with `TEST_TARIFF`:
  - Only the 2–3 Nov session → `top3` kW `[9.93, 2.011]`, `estimatedFee ≈ 224.9684` (`(11.941/3) × 45.216 × 1.25`), share of that session = full fee.
  - Hours from two sessions A `[10, 4]` and B `[8, 9]` → top3 `[10, 9, 8]`, shares A = fee×10/27, B = fee×17/27.
  - `peakIncrease` with current top3 `[10,10,10]` and extra hours of 3.7 kW → `0`; with empty month and extra `[11, 4]` → `(15/3) × 45.216 × 1.25 = 282.6`.
  - A session hour on `2026-10-31T23:30` local-November (`2026-10-31T23:00:00Z`) counts in `2026-11`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): monthly peak fee estimate`.

### Task 10: Planner

**Files:** Create `shared/planner.ts`, `shared/planner.test.ts`

**Interfaces:**
- Consumes: `hourRateExVat`, `peakIncrease`, `nextLocalTime`, `localParts`.
- Produces: `planTonight(input: { nowUtc: IsoUtc; batteryPercent: number; settings: Settings; days: Record<string, PriceDay>; tariffs: Tariff[]; peaks: MonthPeaks }): Plan` implementing spec §6.4: window from `max(now, today 18:00 local)` to `nextLocalTime(now, settings.readyBy)`; candidates per kW in `[chargerMaxKw, reducedKw]`, start on every whole UTC hour in the window; last hour takes the remainder; energy cost incl. VAT; `cost = energyCost + peakIncrease`; skip a candidate if any hour has no rate; tie → higher kW then earlier start. `basis` = `'tomorrow'` if the price doc for the ready-by local date exists, else `'today'`. `neededKwh = max(0, target − battery)/100 × usable / efficiency`, rounded to 0.1. Zero needed → `recommendation null, chargeNow false`. No candidate fits → `chargeNow true, recommendation null`. `date` = local date of `nowUtc`.

- [ ] **Step 1: Failing tests** (now `2026-11-03T17:00:00Z` = 18:00 local, `DEFAULT_SETTINGS`, `TEST_TARIFF`, prices for 2026-11-03 and 2026-11-04):
  - Battery 62 → `neededKwh 15`.
  - Flat price everywhere, empty peaks → recommendation `kw 3.7` (5 hours), alternative `kw 11`, and `recommendation.peakIncrease < alternative.peakIncrease`.
  - Flat price, peaks top3 `[10,10,10]` → recommendation `kw 11` (tie on cost → higher kW), start `'2026-11-03T21:00:00.000Z'` (22:00 local: the first low-load hour, since 18–22 pays the high transfer fee; ties among low-load starts → earliest).
  - Prices 5× cheaper for local 02:00–04:00 only, peaks `[11,11,11]` → recommendation `kw 11`, start `'2026-11-04T01:00:00.000Z'`, end `'2026-11-04T03:00:00.000Z'`.
  - Battery 85 → `neededKwh 0`, `recommendation null`, `chargeNow false`.
  - Battery 5 with `chargerMaxKw 3` (needs 25 h) → `chargeNow true`.
  - No 2026-11-04 doc → `basis 'today'` and only candidates whose hours all have prices.
  - DST night (now `2026-10-24T16:00:00Z`) runs without throwing and every candidate's hours are distinct UTC hours.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): tonight planner`.

### Task 11: Insights and formatting

**Files:** Create `shared/insights.ts`, `shared/format.ts`, tests

**Interfaces:**
- Produces:
  - `monthTotals(sessions: PricedSession[], month: string, odometer: { km: number; date: string }[], peaks: MonthPeaks | null, settings: Settings): { kWh: number; cost: number; avgKrPerKwh: number | null; km: number | null; krPer100km: number | null; petrolCost: number | null; saving: number | null; peakFee: number | null; pendingCount: number }` — `cost` = Σ priced totals + peakFee; `km` = last − first odometer reading within the month (null if < 2 readings).
  - `formatKr(n: number): string` → `'18,66 kr'`; `formatKwh(n: number): string` → `'11,9 kWh'` (sv-SE number format, plain space before the unit, no-break spaces from `Intl` replaced); `formatAgo(iso: IsoUtc, now: IsoUtc): string` → `'just now'` (< 1 min), `'3 min ago'`, `'2 h ago'`, `'4 d ago'`. UI copy is English.

- [ ] **Step 1: Failing tests:** cost 100 kr (no peaks), odometer 1000 → 1500 → `krPer100km 20`; petrol `{7.5, 18}` → `petrolCost 675`, `saving 575`; one reading → `km null, krPer100km null`; pending sessions excluded from cost and counted; `formatKr(18.6565845)` → `'18,66 kr'`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): monthly insights and formatting`.

### Task 12: Volvo parsers and alerts

**Files:** Create `shared/volvo.ts`, `shared/alerts.ts`, tests. Uses `backend/test/fixtures/volvo/*.json` from Task 4 (import via relative path in tests).

**Interfaces:**
- Produces (`volvo.ts`): `parseCarState(raw: { vehicles: unknown; doors?: unknown; windows?: unknown; odometer?: unknown; tyres?: unknown; warnings?: unknown; energy?: unknown; location?: unknown; diagnostics?: unknown }, nowUtc: IsoUtc): CarState` — each missing/failed section → that field `null`; per-field timestamps from Volvo's `timestamp`/`updatedAt` values; `vinLast4` only.
- Produces (`alerts.ts`):
  - `leftOpenIssues(car: CarState): string[]` — sorted; `'unlocked'` if `locked.value === false`, plus every `openings` key whose value is `'open'`.
  - `shouldSendLeftOpen(issues: string[], nowUtc: IsoUtc, lastKey: string | null): { send: boolean; key: string | null }` — send only if local hour ≥ 22 or < 6, issues non-empty, and `issues.join(',') !== lastKey`; when issues become empty return `key: null` so the next issue notifies again.
  - `reconnectDue(grantStartedAt: IsoUtc, nowUtc: IsoUtc): boolean` — true from `grantStartedAt + 3 months − 7 days`.
  - `leftOpenMessage(issues: string[]): string` — e.g. `'XC40 is unlocked · rear left window open'`.

- [ ] **Step 1: Failing tests:** fixtures parse into a `CarState` with non-null `battery`, `locked`, `openings`, `odometerKm`; a fixture set with `doors` missing → `locked` and door openings null but battery present. `leftOpenIssues` for unlocked + rear-left window → `['unlocked','window:rearLeft']`. `shouldSendLeftOpen` at 23:00 local with new issues → send; same issues again → no send; at 15:00 local → no send. `reconnectDue('2026-11-06T00:00:00Z','2027-01-30T00:00:00Z')` → true, `'2027-01-29T00:00:00Z'` → false.
- [ ] **Step 2:** Run → FAIL. Implement against the recorded field names. Run → PASS.
- [ ] **Step 3: Commit** `feat(shared): Volvo car state parsing and alerts`.

### Task 13: Push sender and fetchPrices

**Files:** Create `backend/src/lib/push.ts`, `backend/src/providers/elpriset.ts`, `backend/src/fetchPrices.ts`, tests

**Interfaces:**
- Produces:
  - `sendPush(input: { kind: 'plugIn' | 'sessionDone' | 'leftOpen' | 'reconnect'; title: string; body: string; dedupeKey: string; url: string }): Promise<'sent' | 'duplicate' | 'disabled'>` — skips if `private/notified/{dedupeKey}` exists (created in the same transaction) or `config/settings.notifications[kind]` is false (`reconnect` always on); sends FCM multicast to every `users/*/pushTokens/*`; deletes tokens FCM reports as unregistered.
  - `fetchPriceDay(date: string, fetchFn = fetch): Promise<PriceDay | null>` — `null` on 404.
  - `runFetchPrices(nowUtc: IsoUtc, deps: { fetchFn }): Promise<{ written: string[]; repriced: string[]; tomorrowArrived: boolean }>` — fetches today, tomorrow and any missing day in the last 7; writes `prices/{date}`; re-prices every `sessions` doc with `status 'pending'` and updates `peaks/{month}`; `tomorrowArrived` true when tomorrow's doc is newly written. `deps` also takes `onTomorrowArrived: () => Promise<unknown>`, called once when `tomorrowArrived`; the scheduled export passes `async () => {}` until Task 16 wires `runPlanTonight`.
  - Scheduled export `fetchPrices` (`every day 13:30` and `every 1 hours`, `timeZone: 'Europe/Stockholm'`) calling `runFetchPrices`.

- [ ] **Step 1: Failing tests** (emulator, stubbed fetch from fixture): first run writes today/tomorrow, returns `tomorrowArrived true` and calls `onTomorrowArrived` once; second identical run writes nothing new and `tomorrowArrived false`; a seeded pending session becomes `priced` once its day is written; 404 for tomorrow → `tomorrowArrived false`, no throw. `sendPush` twice with the same `dedupeKey` → `'sent'` then `'duplicate'` and one FCM call (messaging stubbed); with `notifications.sessionDone false` → `'disabled'`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(backend): spot price fetch and push sender`.

### Task 14: pollZaptec

**Files:** Create `backend/src/providers/zaptec.ts`, `backend/src/pollZaptec.ts`, `backend/test/fixtures/zaptec/{token.json,chargers.json,state.json}`, test

**Interfaces:**
- Produces:
  - `createZaptecClient(creds: { username: string; password: string }, fetchFn = fetch): { history(pageSize?: number): Promise<unknown>; chargerState(): Promise<ChargerState> }` — caches the token in memory until 5 min before `expires_in`; `history` calls `/api/chargehistory?DetailLevel=1&PageSize=20&SortDescending=true`; `chargerState` calls `/api/chargers` then `/api/chargers/{id}/state` and maps observation ids: `710` ChargerOperationMode (1 disconnected, 2 connected, 3 charging, 5 finished) → `pluggedIn`/`charging`; `513` TotalChargePower W → `liveKw`; `553` TotalChargePowerSession kWh → `sessionKwh`. **Before writing the mapping, record a real `state` response into the fixture with the owner's credentials and confirm these ids; adjust if they differ.**
  - `runPollZaptec(nowUtc, deps: { client }): Promise<{ newSessions: string[] }>` — writes `charger/state`; parses history; for each session id **not already in `sessions`**: prices it (`priceSession`), attaches `planned` from `plans/{local date of start}` if present, writes it, recomputes `peaks/{month}` and writes `peakShare` to every session of the month, sends `sessionDone` push (`dedupeKey: session:<id>`, body e.g. `'Charged 11.9 kWh for 18,66 kr (1,56 kr/kWh)'`, or `'Charged 11.9 kWh, price pending'`). Existing session ids are skipped entirely.
  - Scheduled export `pollZaptec` every 5 minutes.
- Writes `status/zaptec {lastOkAt}` on every successful poll (rules from Task 3 already cover `status/*`).

- [ ] **Step 1: Failing tests** (emulator, stubbed client): first run on fixture creates 4 sessions and 4 pushes; **second run creates 0 sessions and 0 pushes** and `peaks/2026-11` is unchanged; a session with missing prices is written `pending` and push says price pending; `charger/state` matches fixture mapping.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(backend): poll Zaptec sessions and price them`.

### Task 15: pollCar

**Files:** Create `backend/src/providers/volvo.ts`, `backend/src/pollCar.ts`, test

**Interfaces:**
- Consumes: `getAccessToken`, `parseCarState`, `leftOpenIssues`, `shouldSendLeftOpen`, `leftOpenMessage`, `reconnectDue`, `sendPush`.
- Produces:
  - `createVolvoClient(apiKey: string, getToken: () => Promise<string>, fetchFn = fetch): { vehicles(): Promise<unknown>; section(vin: string, name: 'doors'|'windows'|'odometer'|'tyres'|'warnings'|'diagnostics'|'statistics'): Promise<unknown>; energy(vin): Promise<unknown>; location(vin): Promise<unknown>; command(vin, name: 'lock'|'climatization-start'|'climatization-stop'): Promise<{ ok: boolean; status: string; message?: string }> }` — sends `vcc-api-key` + Bearer; a failed section resolves `undefined` (logged), not a throw. `command` accepts only those three names (TypeScript literal union and a runtime guard); if the recorded `commands.json` fixture names the endpoints differently, map these three names onto Volvo's paths there.
  - `runPollCar(nowUtc, deps): Promise<void>` — if `private/volvo` missing or `lastRefreshError` set: return. On `VolvoReconnectRequired`: send `reconnect` push (`dedupeKey: reconnect:failed:<grantStartedAt>`), return. Otherwise fetch all sections in parallel, write `car/state`, upsert `car/odometer/{local date}`, evaluate left-open (key stored in `private/notified/leftOpenLast`), send `reconnect` push when `reconnectDue` (`dedupeKey: reconnect:due:<grantStartedAt>`).
  - Scheduled export `pollCar` every 10 minutes.

- [ ] **Step 1: Failing tests** (emulator, fixtures from Task 4): writes `car/state` with `vinLast4`, never a full VIN (assert the doc's JSON lacks `YV1TESTVIN0000001`); a 500 on `/doors` still writes battery; unlocked fixture at 23:00 local → one `leftOpen` push, second run → none; `VolvoReconnectRequired` → reconnect push and no `car/state` write; `command('unlock' as never)` throws.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(backend): poll Volvo car state with alerts`.

### Task 16: planTonight

**Files:** Create `backend/src/planTonight.ts`, test. Modify `backend/src/fetchPrices.ts` to call it when `tomorrowArrived`.

**Interfaces:**
- Produces: `runPlanTonight(nowUtc): Promise<Plan | null>` — reads `car/state.battery`, `charger/state`, settings, tariffs, prices for today/tomorrow, `peaks/{month}`; `null` if no battery data. Writes `plans/{plan.date}`. Sends `plugIn` push (`dedupeKey: plugIn:<plan.date>`) when `recommendation` or `chargeNow` and `!charger.pluggedIn`; body e.g. `'62% → 80%: plug in, cheapest 01:00–04:00, ≈ 18 kr'` (local times), or `'62% → 80%: plug in now, not enough time to wait for cheap hours'` for `chargeNow`. Scheduled export `planTonight` at `18:00` Europe/Stockholm.

- [ ] **Step 1: Failing tests** (emulator): writes the plan; plugged-in car → plan written, no push; second call same evening → no second push; after `tomorrowArrived` the plan doc is overwritten with `basis 'tomorrow'` but no second push; battery above target → no push.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(backend): tonight plan and plug-in reminder`.

### Task 17: Lock and climate commands

**Files:** Create `backend/src/commands.ts`, test

**Interfaces:**
- Produces callables `lockCar`, `startClimate`, `stopClimate`: `assertAllowed`, then `createVolvoClient(...).command(vin, ...)`; return `{ ok, status, message? }`; never retry; `VolvoReconnectRequired` → `HttpsError('failed-precondition', 'volvo-reconnect')`.

- [ ] **Step 1: Failing tests:** non-allowlisted caller → `permission-denied` and no Volvo fetch; allowed caller → exactly one POST to `/connected-vehicle/v2/vehicles/<vin>/commands/lock`; Volvo 4xx → `{ ok:false, message }` with no second fetch. The module exports exactly `lockCar`, `startClimate`, `stopClimate` (assert `Object.keys`).
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. Deploy functions.
- [ ] **Step 3: Commit** `feat(backend): lock and climate commands`.

### Task 18: Frontend data hooks and Home

**Files:** Create `frontend/lib/{useDoc.ts,useCollection.ts}`, `frontend/components/{BatteryBar,TonightCard,PriceChart,CommandButtons,Banner}.tsx`, replace `frontend/app/(app)/page.tsx`; tests beside components

**Interfaces:**
- Produces: `useDoc<T>(path: string): { data: T | null; loading: boolean; error: Error | null }`, `useCollection<T>(path: string, constraints?: QueryConstraint[]): { data: (T & { id: string })[]; loading: boolean; error: Error | null }` (onSnapshot).
- Home per spec §7: car summary (locked, `BatteryBar` %, range, plugged/charging, `formatAgo`); while `charger.charging`: live kW, `sessionKwh`, cost so far (`allInRateInclVat` × kWh), Volvo `estFullAt`; `TonightCard` from `plans/{today}` (recommendation window in local time, kWh, cost, "reduced current saves X kr" when `alternative` exists, "prices for tomorrow not out yet" when `basis 'today'`); `PriceChart` (inline SVG bars per hour incl. VAT for today+tomorrow, plan window highlighted, current hour marked; colours from tokens); `CommandButtons` (Lock hidden when locked; climate start/stop; confirm dialog; shows returned message); `Banner` "Charger data delayed" when `status/zaptec.lastOkAt` older than 60 min, "Reconnect Volvo" (linking to `/settings`) when `status/volvo` is missing or `connected` is false.

- [ ] **Step 1: Failing tests** (Vitest + Testing Library, hooks mocked): `TonightCard` shows `'01:00–04:00'` and `'18,40 kr'` for a fixture plan; shows "prices for tomorrow not out yet" for `basis 'today'`; `CommandButtons` with `locked true` has no Lock button and **never renders an element with text matching /unlock/i**; `Banner` shows delayed text for `lastOkAt` 61 min ago and nothing at 59.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(frontend): home screen`.

### Task 19: Car screen

**Files:** Create `frontend/app/(app)/car/page.tsx`, `frontend/components/StatusRow.tsx`, test

- Shows each `openings` key (human labels: `door:frontLeft` → "Front left door"), tyres, warnings, service, odometer, trip statistics if present, location as an OpenStreetMap static tile image (`https://tile.openstreetmap.org/{z}/{x}/{y}.png` at z=16, computed from lat/lng) with "Open in Maps" linking `https://maps.apple.com/?ll=<lat>,<lng>`, and each section's `formatAgo` age. Null sections show "Not available".
- [ ] **Step 1: Failing test:** with fixture `CarState`, renders "Rear left window" with "Open", and "Not available" for a null `tyres`; map link contains `ll=59.31,18.16`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(frontend): car screen`.

### Task 20: History screens

**Files:** Create `frontend/app/(app)/history/page.tsx`, `frontend/app/(app)/history/[id]/page.tsx`, `frontend/components/{SessionRow,MonthSummary}.tsx`, tests

- List grouped by local month, newest first: `MonthSummary` (`monthTotals`: kWh, kr, avg kr/kWh, kr/100 km, petrol cost and saving, peak fee estimate marked "estimate" unless `final`, pending count) above `SessionRow`s (date, kWh, kr or "pending", kr/kWh, planned vs actual delta). Detail: per-hour table (local hour, kWh, spot, markup, transfer, energy tax, VAT, total) recomputed client-side with `hourRateExVat` from the `prices` docs, plus peak share. Back link to `/history`.
- [ ] **Step 1: Failing tests:** `MonthSummary` with fixture data shows `'20,00 kr'`-style kr/100 km and the saving; `SessionRow` for pending session shows "pending"; detail page for the 2–3 Nov fixture shows two rows, `00:00` and `01:00`, and total `'18,66 kr'`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(frontend): history and session detail`.

### Task 21: Settings

**Files:** Create `frontend/app/(app)/settings/page.tsx`, `frontend/components/{TariffEditor,AllowlistEditor,VolvoConnection}.tsx`, tests. Remove the temporary Connect button from Task 4.

- Settings form writes `config/settings` (validation: target 10–100, readyBy `HH:MM`, positive numbers, efficiency 0.5–1).
- `TariffEditor`: list tariffs by `effectiveFrom`; "Add tariff" copies the latest; each money field has an incl./excl. VAT toggle and stores ex-VAT via `exVat`; high-load months as 12 checkboxes; warning if any `pending` session's hours fall before the earliest `effectiveFrom`.
- `AllowlistEditor`: add/remove emails; cannot remove your own email.
- `VolvoConnection`: "Connected · valid until <grantStartedAt + 3 months>" or "Not connected"/"Reconnect" button (calls `volvoAuthStart`, navigates to `url`); reads `?volvo=connected|error` and shows the result. Status comes from `status/volvo` (Task 4).
- Notification toggles (writes `settings.notifications`) and the push enable button from Task 22.
- [ ] **Step 1: Failing tests:** entering `0.368` incl. VAT stores `0.2944`; removing own email is disabled; `VolvoConnection` with `grantStartedAt '2026-11-06T…'` shows "valid until 6 Feb 2027"; readyBy `'7am'` shows a validation error and does not write.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(frontend): settings, tariffs, allowlist, Volvo connection`.

### Task 22: Push registration

**Files:** Create `frontend/lib/push.ts`, test. Modify `frontend/public/sw.js` (FCM background messages show `title`/`body`, click opens `data.url`), `frontend/app/(app)/settings/page.tsx`.

**Interfaces:**
- Produces: `enablePush(uid: string): Promise<'enabled' | 'denied' | 'unsupported' | 'needs-install'>` — `'needs-install'` on iOS when not `display-mode: standalone`; otherwise requests permission, gets an FCM token with `NEXT_PUBLIC_FIREBASE_VAPID_KEY` and the existing SW registration, writes `users/{uid}/pushTokens/{token}`.
- [ ] **Step 1: Failing tests:** iOS UA + non-standalone → `'needs-install'` and no permission prompt; permission denied → `'denied'`, no write; granted → one write at the token path.
- [ ] **Step 2:** Run → FAIL. Implement (copy approach from frescati `frontend/lib/push.ts`). Run → PASS.
- [ ] **Step 3: Owner action:** install the PWA on the iPhone Home Screen, enable notifications, run `sendTestPush`-style check by triggering `runPlanTonight` from the emulator or waiting for 18:00.
- [ ] **Step 4: Commit** `feat(frontend): web push registration`.

### Task 23: Seed and end-to-end tests

**Files:** Create `backend/scripts/seed.ts`, `playwright.config.ts`, `e2e/{fixtures.ts,home.spec.ts,history.spec.ts,settings.spec.ts}`, `scripts/e2e-stack.sh` (copy frescati's approach: production build + emulators + seed + `next start`)

- Seed writes: allowlist with a dev user, `DEFAULT_SETTINGS`, `TEST_TARIFF`, prices for the seeded dates from the elpriset fixture, the four Zaptec fixture sessions priced through `priceSession`/`computeMonthPeaks` (derived, never hand-written), a `car/state` from the Volvo fixtures, today's plan via `planTonight`. Dev sign-in via the Auth emulator (email/password test user) when `NEXT_PUBLIC_USE_EMULATORS=1`.
- [ ] **Step 1: Specs** (projects `mobile` and `desktop`, desktop depends on mobile):
  - `home.spec.ts`: battery % and Tonight card visible; no element matches `/unlock/i`.
  - `history.spec.ts`: November summary visible; tapping the 2–3 Nov session shows two hourly rows; back returns to the list.
  - `settings.spec.ts`: add a tariff with transfer high `0.368` incl. VAT, reload, field shows `0.368` incl. VAT.
- [ ] **Step 2:** Check port 3000 is free, then run `pnpm test:e2e` → PASS on both projects.
- [ ] **Step 3:** Run `pnpm test && pnpm test:rules && pnpm test:backend && pnpm --filter frontend test && pnpm typecheck` → all PASS.
- [ ] **Step 4: Commit** `test: seed data and end-to-end journeys`.
- [ ] **Step 5: Owner action:** enter the real tariff from invoices (spec §11) in Settings; confirm the first real session's cost against the Fortum + Nacka invoice line items within a few percent.
