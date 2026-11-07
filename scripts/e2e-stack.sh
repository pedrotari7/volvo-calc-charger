#!/usr/bin/env bash
#
# The whole stack for `pnpm test:e2e`: a production build of the frontend, the
# Auth and Firestore emulators, a seeded database, and `next start` on 3000.
#
# A production build rather than `next dev`: dev compiles each route on first
# visit, which would put compile time on the critical path of every test, and
# the shipped app is the one worth testing. `NEXT_PUBLIC_*` is inlined at build
# time, so the emulator flag and the demo project id are set here, not on the
# server. The build runs beside the emulator boot, since neither needs the other;
# the command inside `emulators:exec` is a different shell, so a marker file is
# how it finds out whether the build finished and worked.
#
# `exec` replaces this shell, so an EXIT trap would never fire. The marker lives
# at a fixed path and is truncated on every run instead of using `mktemp`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATUS="${TMPDIR:-/tmp}/volvo-e2e-frontend-build"
: > "$STATUS"

export NEXT_PUBLIC_USE_EMULATORS=1
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-volvo
export NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key

(
	if pnpm --filter frontend build; then
		printf 'ok' > "$STATUS"
	else
		printf 'failed' > "$STATUS"
	fi
) &

# Written as a variable so the quoting is legible: `$STATUS` is this shell's,
# `\$(cat …)` is the inner one's. A failed build stops the `&&` chain, which
# surfaces as the webServer never coming up rather than a stale build being tested.
serve=$(cat <<SHELL
while [ ! -s "$STATUS" ]; do sleep 0.5; done &&
[ "\$(cat "$STATUS")" = ok ] &&
pnpm seed &&
pnpm --filter frontend start
SHELL
)

exec scripts/emulators.sh "$serve" --only auth,firestore --project demo-volvo
