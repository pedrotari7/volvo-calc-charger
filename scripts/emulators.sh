#!/usr/bin/env bash
#
# Run the Firebase emulators.
#
#   scripts/emulators.sh                          start them, leave them running
#   scripts/emulators.sh 'pnpm seed && …'         start them, run a command, stop
#   scripts/emulators.sh 'jest …' --only firestore    anything after the command
#                                                     is passed to firebase
#
# The only real work here is finding a JDK the emulators will accept.
# firebase-tools needs 21 or newer and takes whatever `java` is first on the
# PATH, which on a Mac with an older JDK installed is not it, so every emulator
# command has to be prefixed with JAVA_HOME by hand, forever, and forgetting
# fails with a stack trace that says nothing about Java versions. Looking for
# one here costs a dozen lines and makes `pnpm emulators` work as written.
#
# Nothing is forced: a JAVA_HOME that already points at a new enough JDK is left
# alone, and a machine with none of the usual Homebrew paths falls through to
# whatever the PATH provides, which is what CI wants.

set -euo pipefail

MINIMUM_JDK=21

# Major version of a `java` binary, or nothing if it can't be read. Handles both
# the modern `21.0.1` and the legacy `1.8.0` forms. Done in awk rather than sed
# because BSD sed has no `\?`, and getting nothing back here reads exactly like
# "no JDK found", so the failure is a silent fall-through to the wrong Java.
java_major() {
	local binary="$1"
	[ -x "$binary" ] || return 0

	"$binary" -version 2>&1 |
		awk -F'"' '/version/ { split($2, parts, "."); print (parts[1] == 1 ? parts[2] : parts[1]); exit }'
}

is_new_enough() {
	local major
	major=$(java_major "$1")

	[ -n "$major" ] && [ "$major" -ge "$MINIMUM_JDK" ]
}

if [ -z "${JAVA_HOME:-}" ] || ! is_new_enough "${JAVA_HOME}/bin/java"; then
	for candidate in \
		/usr/local/opt/openjdk@21 \
		/opt/homebrew/opt/openjdk@21 \
		/usr/local/opt/openjdk \
		/opt/homebrew/opt/openjdk \
		/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home; do
		if is_new_enough "$candidate/bin/java"; then
			export JAVA_HOME="$candidate"
			break
		fi
	done
fi

if [ $# -eq 0 ]; then
	exec pnpm exec firebase emulators:start
fi

command="$1"
shift

exec pnpm exec firebase emulators:exec "$@" "$command"
