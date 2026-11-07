import { beforeAll, describe, expect, it } from 'vitest';

interface Lib {
	safeUrl(value: unknown, origin: string): string;
	parsePush(
		data: { json(): unknown; text(): string } | undefined,
		origin: string,
		tag: string
	): { title: string; body: string; tag: string; url: string };
}
const ORIGIN = 'https://app.example';
let lib: Lib;
const json = (v: unknown) => ({ json: () => v, text: () => JSON.stringify(v) });

beforeAll(async () => {
	// @ts-expect-error plain JS worker script, no types
	await import('../public/sw-lib.js');
	lib = (globalThis as unknown as { __swLib: Lib }).__swLib;
});

describe('parsePush', () => {
	it('reads an FCM payload', () => {
		const p = lib.parsePush(
			json({
				notification: { title: 'Done', body: 'Cost 12 kr' },
				data: { url: '/sessions/1', kind: 'sessionDone' },
			}),
			ORIGIN,
			'u1'
		);
		expect(p).toEqual({ title: 'Done', body: 'Cost 12 kr', tag: 'sessionDone', url: '/sessions/1' });
	});

	it('falls back to data fields, fcmOptions link and a unique tag', () => {
		const p = lib.parsePush(
			json({ data: { title: 'T', body: 'B' }, fcmOptions: { link: `${ORIGIN}/x?a=1` } }),
			ORIGIN,
			'u1'
		);
		expect(p).toEqual({ title: 'T', body: 'B', tag: 'u1', url: '/x?a=1' });
	});

	it('uses defaults for non-JSON and empty payloads', () => {
		const text = {
			json: () => {
				throw new Error('no');
			},
			text: () => 'hello',
		};
		expect(lib.parsePush(text, ORIGIN, 'u1')).toEqual({
			title: 'Volvo Charge',
			body: 'hello',
			tag: 'u1',
			url: '/',
		});
		expect(lib.parsePush(undefined, ORIGIN, 'u2')).toEqual({
			title: 'Volvo Charge',
			body: '',
			tag: 'u2',
			url: '/',
		});
	});

	it('sends other-origin urls to /', () => {
		const p = lib.parsePush(json({ data: { url: 'https://evil.example/x' } }), ORIGIN, 'u1');
		expect(p.url).toBe('/');
	});
});

describe('safeUrl', () => {
	it.each([
		['/a/b?c=1#d', '/a/b?c=1#d'],
		[`${ORIGIN}/ok`, '/ok'],
		['https://evil.example/', '/'],
		['javascript:alert(1)', '/'],
		['//evil.example/x', '/'],
		['http://[bad', '/'],
		[undefined, '/'],
		[42, '/'],
	])('%s -> %s', (input, out) => expect(lib.safeUrl(input, ORIGIN)).toBe(out));
});
