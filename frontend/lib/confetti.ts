'use client';

const COLORS = ['#30d158', '#5ef08a', '#7d7aff', '#ffd60a', '#ff9f0a', '#64d2ff', '#ffffff'];

const reducedMotion = (): boolean =>
	typeof window === 'undefined' ||
	typeof window.matchMedia !== 'function' ||
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A short burst of confetti from a point on screen (viewport px), drawn on a throwaway canvas.
 * Does nothing with reduced motion or without a canvas (tests).
 */
export const burstConfetti = (x = window.innerWidth / 2, y = window.innerHeight / 3, count = 90): void => {
	if (reducedMotion() || typeof document === 'undefined') return;
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext?.('2d');
	if (!ctx) return;
	const dpr = window.devicePixelRatio || 1;
	canvas.width = window.innerWidth * dpr;
	canvas.height = window.innerHeight * dpr;
	Object.assign(canvas.style, {
		position: 'fixed',
		inset: '0',
		width: '100%',
		height: '100%',
		pointerEvents: 'none',
		zIndex: '100',
	});
	canvas.setAttribute('aria-hidden', 'true');
	document.body.appendChild(canvas);
	ctx.scale(dpr, dpr);

	const bits = Array.from({ length: count }, () => {
		const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
		const speed = 6 + Math.random() * 8;
		return {
			x,
			y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			size: 5 + Math.random() * 5,
			spin: Math.random() * Math.PI,
			vspin: (Math.random() - 0.5) * 0.4,
			color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
			round: Math.random() < 0.3,
		};
	});

	const start = performance.now();
	const LIFE = 2200;
	const frame = (t: number) => {
		const age = t - start;
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - LIFE * 0.6) / (LIFE * 0.4));
		for (const b of bits) {
			b.vy += 0.28;
			b.vx *= 0.985;
			b.vy *= 0.985;
			b.x += b.vx;
			b.y += b.vy;
			b.spin += b.vspin;
			ctx.save();
			ctx.translate(b.x, b.y);
			ctx.rotate(b.spin);
			ctx.fillStyle = b.color;
			if (b.round) {
				ctx.beginPath();
				ctx.arc(0, 0, b.size / 2, 0, Math.PI * 2);
				ctx.fill();
			} else {
				// Flutter: squash one axis as the piece turns.
				ctx.fillRect(-b.size / 2, (-b.size / 4) * Math.abs(Math.cos(b.spin * 2)), b.size, b.size / 2);
			}
			ctx.restore();
		}
		if (age < LIFE) requestAnimationFrame(frame);
		else canvas.remove();
	};
	requestAnimationFrame(frame);
};

/** Fire confetti once per `key`, remembered in localStorage. Returns whether it fired. */
export const celebrateOnce = (key: string, x?: number, y?: number): boolean => {
	try {
		const k = `celebrated:${key}`;
		if (localStorage.getItem(k)) return false;
		localStorage.setItem(k, '1');
	} catch {
		return false;
	}
	burstConfetti(x, y);
	return true;
};
