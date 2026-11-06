// Keep test output focused on failures: console.log/warn are silenced by
// default. A test can still assert a call happened (e.g.
// `expect(console.warn).toHaveBeenCalledWith(...)`) since these are spies,
// not stubs-with-no-record. Shared by every suite: the shared/, backend and
// rules configs point `setupFiles` straight at this file since they all
// resolve the repo root; frontend/vitest.setup.ts imports it because the
// frontend project roots there instead.
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});
