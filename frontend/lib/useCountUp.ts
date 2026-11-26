'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 700;

const animates = (): boolean =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	typeof window.requestAnimationFrame === 'function' &&
	!window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * `target`, counted up to from the previous value with an ease-out, for hero numbers. Without motion
 * (reduced motion, or no matchMedia as in tests) it is `target` straight away.
 */
export const useCountUp = (target: number): number => {
	const [shown, setShown] = useState(() => (animates() ? 0 : target));
	const from = useRef(shown);

	useEffect(() => {
		if (!animates()) {
			setShown(target);
			from.current = target;
			return;
		}
		const start = performance.now();
		const begin = from.current;
		let raf = 0;
		const step = (t: number) => {
			const k = Math.min(1, (t - start) / DURATION_MS);
			const v = begin + (target - begin) * (1 - (1 - k) ** 3);
			setShown(v);
			from.current = v;
			if (k < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [target]);

	return shown;
};
