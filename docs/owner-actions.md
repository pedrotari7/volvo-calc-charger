# Owner actions

## Verify Zaptec state ids

The Zaptec state mapping (`backend/src/providers/zaptec.ts`) uses ids from Zaptec's documentation: `710` ChargerOperationMode (1 disconnected, 2 connected, 3 charging, 5 finished), `513` TotalChargePower in W, `553` TotalChargePowerSession in kWh. The fixtures in `backend/test/fixtures/zaptec/{token,chargers,state}.json` are marked `"_source": "documented"` because no real response has been captured. Verify once, ideally while a charge is running:

```sh
# 1. Token (prompts for the password so it stays out of shell history)
read -rs ZAPTEC_PASSWORD
TOKEN=$(curl -s https://api.zaptec.com/oauth/token \
  -d grant_type=password -d "username=<ZAPTEC_USERNAME>" --data-urlencode "password=$ZAPTEC_PASSWORD" \
  | jq -r .access_token)

# 2. Charger id
curl -s -H "Authorization: Bearer $TOKEN" https://api.zaptec.com/api/chargers | jq '.Data[] | {Id, Name}'

# 3. State observations
curl -s -H "Authorization: Bearer $TOKEN" https://api.zaptec.com/api/chargers/<CHARGER_ID>/state \
  | jq '.[] | select(.StateId==710 or .StateId==513 or .StateId==553)'
```

Compare:

- `710` should read 3 while charging, 2 when plugged in but not charging, 1 when unplugged, 5 after a finished charge.
- `513` should be the live power in watts (for example about 11000 at 3 x 16 A).
- `553` should be the energy of the current session in kWh and match the Zaptec app.

If an id or unit differs, update the constants at the top of `backend/src/providers/zaptec.ts` and replace the `state.json` fixture with the real (anonymised) response, removing `"_source": "documented"`. Do not paste the token or password anywhere.
