import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../src/lib/firebase';

// Usage: pnpm --filter backend allow <email>
// Uses the emulator when FIRESTORE_EMULATOR_HOST is set, else the real project.
async function main() {
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email?.includes('@')) {
		console.error('Usage: pnpm --filter backend allow <email>');
		process.exit(1);
	}
	await db.doc('config/allowlist').set({ emails: FieldValue.arrayUnion(email) }, { merge: true });
	console.log(`Allowed ${email}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
