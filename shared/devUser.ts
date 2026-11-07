// Emulator-only account. The seed creates it in the Auth emulator and the sign-in
// screen offers it when NEXT_PUBLIC_USE_EMULATORS=1; it never exists in production.
export const DEV_USER = {
	email: 'dev@volvo.test',
	password: 'devpassword',
	displayName: 'Dev User',
} as const;
