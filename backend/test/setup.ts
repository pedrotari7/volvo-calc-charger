// Runs before imports so lib/firebase picks up the emulator.
process.env.GCLOUD_PROJECT = 'demo-volvo';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-volvo' });
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085';
