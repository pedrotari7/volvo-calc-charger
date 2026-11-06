import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// @testing-library/jest-dom 6.9 augments vitest's `Assertion<T>`, but vitest 5
// declares `Assertion<R, T>`, so its own augmentation no longer applies.
declare module 'vitest' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
	interface Assertion<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
