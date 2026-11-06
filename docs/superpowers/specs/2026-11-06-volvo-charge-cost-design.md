# Volvo charge cost — design

Date: 2026-11-06 · Status: approved in brainstorming, awaiting spec review

## 1. Purpose

A private, mobile-first PWA for one household that:

1. Shows the live state of the household's Volvo XC40/C40 Recharge.
2. Prices every home charging session after the fact, using the real tariffs of the two companies that bill it: **Nacka Energi** (grid) and **Fortum** (electricity, hourly/quarter-hourly spot contract).
3. Recommends the cheapest way to reach a fixed target charge by a fixed time, without controlling the charger.

Success looks like: every Zaptec session appears in History within ~10 minutes of ending with a cost the owner trusts to within a few percent of the invoices; the evening push says when to plug in and what it will cost; the car's state is visible at a glance.

## 2. Decisions

| Area | Decision |
|---|---|
| Users | Owner + household. Google sign-in, gated by an email allowlist. |
| Car | Volvo XC40/C40 Recharge (full EV). Shows battery, range, charging state, locks, doors, windows, tailgate, tyres, warnings, service, odometer, location, trip statistics. |
| Car commands | **Lock** and **start/stop climate** only. **No unlock**, no engine start, no honk/flash. The `conve:unlock` scope is never requested. |
| Charger | Zaptec at the owner's house, on the house meter. Source of truth for energy per session. |
| Electricity contract | Fortum timpris/kvartspris: SE3 spot + Fortum markup + monthly fee + VAT. |
| Grid tariff | Nacka Energi house tariff: fixed fee, low/high-load transfer fee, energy tax, peak fee (effektavgift) on the average of the month's top-3 hourly kW. All values are configuration with an effective-from date. |
| Peak fee | Estimated from the **charger's own** hourly kW (no whole-house meter data). |
| Session cost | **Marginal cost only**: excludes fixed monthly fees. Peak fee share shown as a separate line. |
| Planner | Recommends only. Fixed target (default 80%) and fixed ready-by time (default 07:00). Compares max current against a reduced current. |
| Insights | kr/100 km per month, and cost versus an equivalent petrol car. |
| Push | Plug-in reminder, session done + cost, car left open, Volvo reconnect needed. |
| Stack | Copy of the `frescati` setup (see §4). |

## 3. Spike findings (2026-11-06)

**Spot prices — verified live.** `GET https://www.elprisetjustnu.se/api/v1/prices/YYYY/MM-DD_SE3.json`, no key. Returns 96 rows `{SEK_per_kWh, EUR_per_kWh, EXR, time_start, time_end}`, quarter-hour resolution, local time with offset, **excluding VAT**. Tomorrow's prices are published around 13:00.

**Zaptec — verified live against the owner's account.**
- Auth: `POST https://api.zaptec.com/oauth/token`, `grant_type=password`. Token lifetime observed **86,399 s (24 h)**. Zaptec has announced the password grant will be phased out, so auth is isolated in one module.
- `GET /api/chargers` returns the one charger (online, active, has an `InstallationId`).
- `GET /api/chargehistory?DetailLevel=1&PageSize=..&SortDescending=true` returns paged sessions (38 at spike time) with `id, startDateTime, endDateTime, energy, energyDetails[]`.
- `energyDetails` are **hourly**, each `{Timestamp, Energy}` is the energy delivered in the interval ending at that timestamp; they sum to the session `energy` (11.941 = 9.930 + 2.011 for the 2026-11-02 session).
- `startDateTime`/`endDateTime` have **no zone marker but are UTC** (they match the `+00:00` detail timestamps). Must be parsed as UTC.
- Zero-kWh sessions exist (short plug-ins) and are ignored.
- The response includes the owner's address, name and email. None of these are stored.
- Observed draw: ~10 kW in one hour. Because of the peak fee this matters more than the spot price (see §6.3).

**Volvo — documentation only; live calls blocked.** Developer-portal test tokens failed (Volvo ID login error) and `localhost` could not be registered as a redirect URI.
- Auth: OAuth 2.0 authorisation code + **PKCE S256 (enforced for new apps)**. Authorise `https://auth.volvocars.com/realms/volvocars/protocol/openid-connect/auth`, token `https://auth.volvocars.com/realms/volvocars/protocol/openid-connect/token`, client auth via `Authorization: Basic base64(client_id:client_secret)`. The old `volvoid.eu.volvocars.com` service stops working after 2027-01-31 and is not used.
- **Refresh token rotation**: every refresh returns a new refresh token and invalidates the old one. **Grant lasts at most 3 months**, then the user must sign in again. Users should tick "Remember me".
- API calls need `Authorization: Bearer` + `vcc-api-key` header. Free tier 10,000 calls/day.
- All needed scopes exist in the new realm: `openid conve:vehicle_relation conve:lock_status conve:doors_status conve:windows_status conve:odometer_status conve:tyre_status conve:warnings conve:diagnostics_workshop conve:trip_statistics conve:battery_charge_level conve:recharge_status conve:command_accessibility conve:commands conve:lock conve:climatization_start_stop energy:state:read energy:capability:read energy:battery_charge_level energy:electric_range energy:charging_connection_status energy:charging_system_status energy:estimated_charging_time energy:recharge_status energy:charging_history:read location:read`.
- Docs say client credentials are issued after publishing. The owner already has a Client ID/Secret; whether they work unpublished is unknown. If the first sign-in fails, publishing is required, which requires `/terms` and `/privacy` to be live.
- **Response shapes are unconfirmed.** The first Volvo task, right after the first deploy, is to sign in on the deployed app, record real responses, and fix parsers/fixtures.

## 4. Architecture

pnpm workspace, Node 24 (`.nvmrc`), same conventions as `frescati`:

```
frontend/   Next.js 15 App Router on Vercel (project name: volvo-calc-charger)
            StyleX tokens, permanently dark. PWA: public/manifest.json, public/sw.js, public/offline.html, icons.
            Reads Firestore directly with onSnapshot. Firebase Auth (Google popup).
            Public static pages: /terms, /privacy.
backend/    Firebase Cloud Functions v2, nodejs24, europe-west1. Scheduled jobs + privileged work only.
shared/     Pure TypeScript, no package.json, imported by both (@shared/* in frontend).
            Tariff maths, session pricing, peak estimate, planner, provider response parsing, insights.
```

There is no API layer. The one HTTP entry point is the Volvo OAuth callback: the registered redirect URI `https://volvo-calc-charger.vercel.app/api/volvo/callback` is proxied by a **Vercel rewrite** to the `volvoCallback` Cloud Function. The "Connect Volvo" button calls a `volvoAuthStart` callable that creates the PKCE verifier and state, stores them in `private/volvoAuth` with a 10-minute expiry, and returns the authorise URL.

### 4.1 Functions

| Function | Trigger | Responsibility |
|---|---|---|
| `fetchPrices` | 13:30, 14:30, then hourly until tomorrow is present; also fills any missing day in the last 7 | Write `prices/{date}`. Re-price `pending` sessions whose hours are now covered. Trigger the planner when tomorrow's prices first land. |
| `pollZaptec` | Every 5 min | Fetch latest history page and charger state. Upsert sessions by Zaptec id (idempotent, so missed polls catch up). On a new completed session with energy > 0: price it, update `peaks/{month}`, send "session done". Also update `charger/state` (plugged in, charging, live kW). |
| `pollCar` | Every 10 min | Refresh Volvo token if needed, fetch snapshot endpoints, write `car/state`, upsert `car/odometer/{date}`. Evaluate "car left open". |
| `planTonight` | 18:00 and after tomorrow's prices land | Write `plans/{date}`. Send "plug in" if battery < target and not plugged in, once per evening. |
| `volvoAuthStart` | Callable (allowlisted) | Build authorise URL with PKCE + state. |
| `volvoCallback` | HTTPS | Validate state, exchange code, store tokens in `private/volvo`, redirect to `/settings`. |
| `lockCar`, `startClimate`, `stopClimate` | Callable (allowlisted) | Send the Volvo command and return the result. No automatic retries. |

Volvo call budget: ~7 endpoints × 144 polls ≈ 1,000/day, well inside 10,000.

### 4.2 Secrets and access

- Firebase Secret Manager: `ZAPTEC_USERNAME`, `ZAPTEC_PASSWORD`, `VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, `VOLVO_API_KEY`.
- `private/volvo` holds the refresh token, access token and expiries. Every refresh runs in a Firestore transaction that writes the new refresh token before the access token is used. Only one function refreshes at a time.
- Firestore rules: a signed-in user whose email is in `config/allowlist.emails` can read everything except `private/*`, and can write only `config/settings`, `tariffs/*`, `config/allowlist` and their own `users/{uid}/pushTokens/*`. All other collections are function-owned.

## 5. Data model

```
config/allowlist             emails: string[]
config/settings              targetPercent (80), readyBy ("07:00"), usableBatteryKwh (75),
                             chargingEfficiency (0.90), chargerMaxKw (11), reducedKw (3.7),
                             petrol: {litresPer100km, krPerLitre}, notifications: {plugIn, sessionDone, leftOpen}
tariffs/{id}                 effectiveFrom (date), vatRate (0.25), each kr value stored **excluding VAT**:
                             fortum: {markupPerKwh, monthlyFee}
                             nacka:  {fixedPerYear, transferLowPerKwh, transferHighPerKwh, peakPerKwMonth,
                                      highLoad: {months[], weekdaysOnly, fromHour, toHour}}
                             energyTaxPerKwh
prices/{YYYY-MM-DD}          quarters: [{start (ISO, local offset), sekPerKwhExVat}] (92/96/100 rows on DST days)
sessions/{zaptecId}          startUtc, endUtc, kWh, hours: [{hourStartUtc, kWh}],
                             status: 'priced' | 'pending', cost: {spot, markup, transfer, energyTax, vat, total},
                             peakShare, planned?: {kWh, cost, windowStart, windowEnd}
peaks/{YYYY-MM}              top3: [{hourStartUtc, kW, sessionId}], estimatedFee, final (bool)
charger/state                pluggedIn, charging, liveKw, sessionKwh, updatedAt
car/state                    battery {percent, rangeKm, chargingStatus, estFullAt}, locks, doors, windows,
                             tyres, warnings, service, odometerKm, location {lat, lng}, each field with its own timestamp
car/odometer/{YYYY-MM-DD}    km
plans/{YYYY-MM-DD}           batteryPercent, neededKwh, recommendation {kw, start, end, cost}, alternative {kw, cost}, basis ('today'|'tomorrow')
private/volvo                refreshToken, accessToken, accessExpiresAt, grantStartedAt, lastRefreshError?
private/volvoAuth            verifier, state, expiresAt
private/notified             dedupe keys for pushes (e.g. leftOpen issue set, plugIn date)
users/{uid}/pushTokens/{t}   FCM tokens
```

Storing every tariff value excluding VAT, with one VAT rate, avoids mixing incl./excl. figures. The tariff editor accepts either and converts.

## 6. Pricing and planning (`shared/`)

### 6.1 Hour price

Session hours come from Zaptec `energyDetails`: each entry's energy was delivered in the interval from the previous entry's timestamp (or the session start) to its own timestamp, and is **spread across the UTC clock hours that interval overlaps, in proportion to the overlap**. For the 2026-11-02 session this gives 9.930 kWh → 23:00 UTC hour and 2.011 kWh → 00:00 UTC hour (the sub-second spill-over is rounded away at 3 decimals). An interval spanning several hours, which happens when details are sparse, is spread evenly instead of landing in one hour and inflating the peak. Hours that round to 0 kWh are dropped.

For a UTC hour `h`:

```
spotAvg(h)     = mean of the four quarter prices covering h (ex VAT)
energyRate(h)  = spotAvg(h) + fortum.markupPerKwh
gridRate(h)    = (isHighLoad(h) ? transferHigh : transferLow) + energyTaxPerKwh
hourCost(h)    = kWh(h) × (energyRate(h) + gridRate(h)) × (1 + vatRate)
```

`isHighLoad` is evaluated in Europe/Stockholm local time. The tariff is the one with the latest `effectiveFrom` ≤ the hour's local date.

### 6.2 Session cost

`total = Σ hourCost` over the session's hours, broken down into spot, markup, transfer, energy tax and VAT. A session is `pending` if any hour lacks prices or a tariff, and is re-priced when they arrive. Fixed fees are excluded.

### 6.3 Peak fee estimate

For each month, collect every charger hour (kW = kWh in that clock hour). `top3` is the three highest. `estimatedFee = (sum(top3.kW) / 3) × peakPerKwMonth × (1 + vatRate)`, dividing by 3 even when the charger has fewer than three hours that month, because the charger adds 0 kW in the other peak hours. Each session's `peakShare` is its hours' share of that fee. Recomputed whenever a session is added. `final` is set after the month ends.

### 6.4 Planner

```
neededKwh = max(0, target% − battery%) × usableBatteryKwh / chargingEfficiency
window    = from max(now, 18:00) to the next readyBy
for kw in [chargerMaxKw, reducedKw]:
  hoursNeeded = ceil(neededKwh / kw)
  for each start hour in window where start + hoursNeeded ≤ readyBy:
    cost = Σ hourly energy cost + increase in this month's estimated peak fee
pick the cheapest candidate; keep the best candidate at the other kW as the alternative
```

Each candidate charges at `kw` for every hour except the last, which takes the remainder. Ties go to the higher kW, then the earlier start.

If tomorrow's prices are missing, the plan uses known prices only, marks `basis: 'today'`, and is recomputed when they arrive. If `neededKwh` is 0 no plan or push is made. If no candidate fits before `readyBy`, the plan recommends charging now at max kW.

### 6.5 Insights

- kr/100 km for a month = month's session cost (including peak share) ÷ (odometer delta km / 100).
- Petrol comparison = km × litresPer100km / 100 × krPerLitre; saving = petrol − electric.

## 7. Screens

Mobile first; four tabs (top bar on desktop, as in `frescati`).

- **Home**: car summary (locked, battery %, range, plugged in/charging, last update). Tonight card: target, recommended window, kWh, expected cost, reduced-current tip with the peak saving. While charging: live kW, kWh and cost so far, estimated finish. Price chart for today and tomorrow with the plan window highlighted. Lock (hidden when locked) and climate buttons with confirmation.
- **Car**: doors/windows/tailgate, tyres, warnings, service, odometer, static map with "Open in Maps", trip statistics.
- **History**: session list (date, kWh, kr, kr/kWh, planned vs actual). Session detail: hourly breakdown and peak share. Monthly totals: kWh, kr, avg kr/kWh, kr/100 km, petrol comparison, peak fee estimate.
- **Settings**: target and ready-by, battery/charger values, tariffs (new rows with effective-from; history kept), petrol values, notification toggles, Volvo connection status ("valid until …", Reconnect), household allowlist.
- **Public**: `/terms` and `/privacy`, static, reachable without sign-in. Terms cover: private non-commercial household app, what data is read, the only commands are lock and climate, storage in Firebase europe-west1, revocation via Volvo ID, estimates are not invoices, contact address.

## 8. Notifications

FCM web push. iOS requires the PWA to be installed to the Home Screen.

| Push | Trigger | Dedupe |
|---|---|---|
| Plug in | `planTonight`: battery < target and not plugged in | Once per evening |
| Session done | Zaptec session completes with energy > 0 | Once per session |
| Car left open | `pollCar` between 22:00 and 06:00 local (taken to mean parked for the night), any unlocked lock or open door/window/tailgate/hood/sunroof | Once per distinct issue set until it changes |
| Volvo reconnect | 7 days before `grantStartedAt + 3 months`, and on refresh failure | Once per condition |

## 9. Error handling

| Failure | Behaviour |
|---|---|
| Spot prices unavailable | Retry hourly. Sessions become `pending` and are re-priced later. Planner shows prices not yet available. No second price source in v1. |
| Zaptec auth/API failure | Retry on next poll. Idempotent upsert means no data loss. Banner "Charger data delayed" after 60 minutes without a successful poll. |
| Volvo refresh failure | Store `lastRefreshError`, stop `pollCar`, show "Reconnect Volvo", send push. |
| Volvo endpoint failure / car offline | Keep last snapshot; UI shows per-field age. |
| Command failure | Show Volvo's error. No automatic retry. |
| No tariff for a date | Session `pending`; Settings shows a warning. |

## 10. Testing

- **`shared/` unit tests (Vitest)**: pricing worked example from the real 2026-11-02 session; UTC parsing of zoneless Zaptec timestamps; high/low-load boundaries; DST days (92/100 quarters, 23/25-hour days); tariff selection by date; peak top-3 and share; planner (midnight-crossing deadline, missing tomorrow, reduced kW winning, already at target, no fitting window); kr/100 km and petrol maths.
- **Backend**: functions against the Firestore emulator with recorded responses for elprisetjustnu, Zaptec (anonymised spike output) and Volvo (doc-shaped until the Volvo capture task replaces them).
- **Rules**: allowlisted read; `private/*` unreadable; function-owned collections unwritable by clients.
- **E2E (Playwright, mobile + desktop)** against a seeded emulator: Home, History drill-down, Settings tariff edit.

## 11. Values the owner must confirm from invoices

These go into the first `tariffs` document; the code does not hardcode them.

- Nacka Energi: fuse size and tariff; fixed fee; low/high transfer fee; exact high-load hours; peak fee (published 2026: 56.52 kr/kW/month incl. VAT for houses); whether energy tax is billed separately.
- Energy tax per kWh for 2026.
- Fortum: markup per kWh and whether quoted incl. VAT; monthly fee.
- Usable battery capacity of the specific car.

## 12. Risks

- **Volvo access**: credentials may not work until the app is published (review reportedly 14–21 days). Mitigation: deploy `/terms` and `/privacy` in the first deploy so publishing can be submitted immediately.
- **Volvo response shapes** unconfirmed (task 1).
- **Zaptec password grant** deprecation: auth isolated in one module.
- **Nacka peak fee rules** are in flux (national requirement dropped mid-2026): tariff config is dated and editable.
- **Peak estimate** is charger-only; the real fee also depends on house load.

## 13. Out of scope

Automatic charger control, weekly schedules, calendar awareness, public charging, invoice reconciliation, multiple cars, other users' cars, HAN/P1 meter integration, remote unlock.
