// sRGB ↔ OKLCH, and the derivations the design page builds on.
//
// Tokens are authored as hex (that's what <input type="color"> speaks) but the
// app's stylesheet is written in oklch, and every derived variable — the card
// that sits just above the background, the hover tint, the sidebar — is a
// lightness nudge. Doing those nudges in oklch keeps them perceptually even
// instead of lurching, which is the whole reason the app was written in oklch
// in the first place.

export type Oklch = { l: number; c: number; h: number; alpha?: number };

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function srgbToLinear(v: number): number {
	return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
	return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function hexToRgb(hex: string): [number, number, number] {
	let h = hex.trim().replace('#', '');
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	const n = parseInt(h.slice(0, 6), 16);
	if (Number.isNaN(n)) return [0, 0, 0];
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
	const to = (v: number) =>
		Math.round(clamp(v, 0, 255))
			.toString(16)
			.padStart(2, '0');
	return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Hex → OKLCH. Björn Ottosson's matrices, via linear sRGB and LMS. */
export function hexToOklch(hex: string): Oklch {
	const [r8, g8, b8] = hexToRgb(hex);
	const r = srgbToLinear(r8 / 255);
	const g = srgbToLinear(g8 / 255);
	const b = srgbToLinear(b8 / 255);

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

	const c = Math.sqrt(A * A + B * B);
	let h = (Math.atan2(B, A) * 180) / Math.PI;
	if (h < 0) h += 360;
	// A neutral has no meaningful hue; pinning it to 0 keeps derived greys from
	// drifting on rounding noise.
	return { l: L, c, h: c < 0.0005 ? 0 : h };
}

export function oklchToHex(color: Oklch): string {
	const { l: L, c, h } = color;
	const A = c * Math.cos((h * Math.PI) / 180);
	const B = c * Math.sin((h * Math.PI) / 180);

	const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
	const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
	const s_ = L - 0.0894841775 * A - 1.291485548 * B;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	return rgbToHex(
		linearToSrgb(clamp(r)) * 255,
		linearToSrgb(clamp(g)) * 255,
		linearToSrgb(clamp(b)) * 255
	);
}

const round = (v: number, places: number) => Number(v.toFixed(places));

/** CSS `oklch(...)` text, with optional alpha as a percentage. */
export function css(color: Oklch): string {
	const base = `${round(color.l, 4)} ${round(color.c, 4)} ${round(color.h, 2)}`;
	return color.alpha != null && color.alpha < 1
		? `oklch(${base} / ${Math.round(color.alpha * 100)}%)`
		: `oklch(${base})`;
}

/** Move a colour toward white (positive) or black (negative) in oklch L. */
export function lighten(color: Oklch, amount: number): Oklch {
	return { ...color, l: clamp(color.l + amount) };
}

/** Blend two colours in oklch. `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a: Oklch, b: Oklch, t: number): Oklch {
	// Hue is angular — interpolate the short way round so a red/blue blend does
	// not swing through green.
	let dh = b.h - a.h;
	if (dh > 180) dh -= 360;
	if (dh < -180) dh += 360;
	return {
		l: a.l + (b.l - a.l) * t,
		c: a.c + (b.c - a.c) * t,
		h: (a.h + dh * t + 360) % 360
	};
}

export function withAlpha(color: Oklch, alpha: number): Oklch {
	return { ...color, alpha };
}

/** Rotate hue, keeping lightness and chroma — used to fan a chart palette out
 *  of the single accent the user actually picked. */
export function rotate(color: Oklch, degrees: number): Oklch {
	return { ...color, h: (color.h + degrees + 360) % 360 };
}

// ---------------------------------------------------------------- contrast

/** WCAG 2.1 relative luminance. Still the standard the guidelines are written
 *  against, so the check stays in sRGB rather than using oklch lightness. */
export function luminance(hex: string): number {
	const [r, g, b] = hexToRgb(hex).map((v) => srgbToLinear(v / 255));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const l1 = luminance(a);
	const l2 = luminance(b);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export type Grade = { label: string; pass: 'pass' | 'large' | 'fail' };

/** AA needs 4.5:1 for body text, 3:1 for large text and UI components. */
export function grade(ratio: number): Grade {
	if (ratio >= 7) return { label: 'AAA', pass: 'pass' };
	if (ratio >= 4.5) return { label: 'AA', pass: 'pass' };
	if (ratio >= 3) return { label: 'AA large', pass: 'large' };
	return { label: 'Fail', pass: 'fail' };
}
