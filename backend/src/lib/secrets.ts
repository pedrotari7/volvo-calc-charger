import { defineSecret } from 'firebase-functions/params';

export const ZAPTEC_USERNAME = defineSecret('ZAPTEC_USERNAME');
export const ZAPTEC_PASSWORD = defineSecret('ZAPTEC_PASSWORD');
export const VOLVO_CLIENT_ID = defineSecret('VOLVO_CLIENT_ID');
export const VOLVO_CLIENT_SECRET = defineSecret('VOLVO_CLIENT_SECRET');
export const VOLVO_API_KEY = defineSecret('VOLVO_API_KEY');
