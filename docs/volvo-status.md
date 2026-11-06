# Volvo integration status

Last updated: 2026-11-06.

## Where things stand

| Item | State |
| --- | --- |
| Client ID / secret / API key | **Untested.** No real Volvo call has been made. Whether unpublished app credentials can sign in is unknown (spec section 3). |
| OAuth code (`volvoAuthStart`, `volvoCallback`, `volvoDisconnect`, `getAccessToken`) | Implemented and tested against the Firestore emulator with a stubbed `fetch`. Never run against `auth.volvocars.com`. |
| Fixtures in `backend/test/fixtures/volvo/` | **Doc-shaped, not captured.** Each file has `"_source": "doc-shaped"`. They follow the Connected Vehicle v2, Energy v2 and Location v1 documentation as best recalled; field names, units and the location wrapper may be wrong. |
| Parsers (later tasks) | Must treat the fixtures as provisional and be re-checked against the capture below. |

Fixture content for alert tests: VIN `YV1TESTVIN0000001`, position 59.3100 N / 18.1600 E, central lock `UNLOCKED`, rear-left window `OPEN`, battery 62 %, not plugged in.

## Owner steps to replace the fixtures with real responses

1. Create `.firebaserc` for your Firebase project, then deploy: `firebase deploy --only functions,firestore:rules`.
2. Enter the secrets (values are prompted, never put them on the command line): `firebase functions:secrets:set VOLVO_CLIENT_ID`, `VOLVO_CLIENT_SECRET`, `VOLVO_API_KEY`.
3. Register `https://volvo-calc-charger.vercel.app/api/volvo/callback` as the redirect URI in the Volvo developer portal, and make sure the Vercel rewrite is deployed.
4. Add your email to the allowlist: `pnpm --filter backend allow <email>` (against the real project).
5. Open the deployed app, press **Connect Volvo** on Home, sign in with your Volvo ID and tick **Remember me**. A successful sign-in lands on `/settings?volvo=connected`.
    - If sign-in fails with an unpublished-app error, note it here and publish the app in the developer portal (needs `/terms` and `/privacy` live). Keep the doc-shaped fixtures until then.
6. Capture (uses your Application Default Credentials against the real project):
    ```
    VOLVO_CLIENT_ID=… VOLVO_CLIENT_SECRET=… VOLVO_API_KEY=… \
    GCLOUD_PROJECT=<project-id> pnpm --filter backend capture-volvo
    ```
    It overwrites the 14 fixture files, replaces the VIN with `YV1TESTVIN0000001` and coordinates with 59.3100, 18.1600, and marks each `"_source": "captured"`. Review `git diff` before committing: nothing identifying (VIN, address, name) should remain.
7. Compare captured shapes with the doc-shaped ones, fix parsers and fixtures that disagree, and record the outcome here.

## Unconfirmed assumptions in `captureVolvo.ts`

- Base URL `https://api.volvocars.com` and the `vcc-api-key` header.
- `Accept: application/vnd.volvocars.api.energy.vehicledata.v1+json` for the Energy endpoints; `application/json` elsewhere. If Energy returns 406, adjust `ENERGY_ACCEPT`.
