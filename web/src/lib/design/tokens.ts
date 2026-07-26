// The design system's token model, and the derivation that turns it into the
// ~30 CSS variables the app actually reads.
//
// You author seven colours per mode. The stylesheet needs thirty: the card that
// sits just above the background, the hover tint, the sidebar that recedes
// behind it, the ring, the chart series. Hand-editing thirty variables is data
// entry, not design — so the seven are the surface and the rest are derived
// from them by fixed rules, in oklch, where a "one step lighter" is actually
// one step lighter.
//
// The defaults reproduce base's existing Paper/Console identity, so installing
// this changes nothing until a token is edited.
import {
	css,
	hexToOklch,
	lighten,
	mix,
	rotate,
	type Oklch
} from './color';

export type Mode = 'light' | 'dark';

export type Palette = {
	bg: string;
	surface: string;
	text: string;
	muted: string;
	border: string;
	accent: string;
	onAccent: string;
};

export type DesignConfig = {
	typography: {
		headingFont: string;
		bodyFont: string;
		monoFont: string;
		baseSize: number;
		scaleRatio: number;
		headingWeight: number;
		bodyWeight: number;
		headingLineHeight: number;
		bodyLineHeight: number;
	};
	color: {
		light: Palette;
		dark: Palette;
		semantic: { success: string; warning: string; danger: string; info: string };
	};
	shape: { radius: number };
	spacing: { density: 'compact' | 'comfortable' | 'roomy' };
};

// Base's current look, expressed in the seven-token vocabulary. These are the
// oklch values from layout.css converted to hex; the derivation below lands
// back within a hair of the hand-written stylesheet.
export const DEFAULTS: DesignConfig = {
	typography: {
		headingFont: 'Space Grotesk',
		bodyFont: 'Space Grotesk',
		monoFont: 'IBM Plex Mono',
		baseSize: 16,
		scaleRatio: 1.25,
		headingWeight: 700,
		bodyWeight: 400,
		headingLineHeight: 1.15,
		bodyLineHeight: 1.6
	},
	color: {
		light: {
			bg: '#FCFAF6',
			surface: '#FFFEFD',
			text: '#221C16',
			muted: '#6E6862',
			border: '#E1DDD8',
			accent: '#DD9300',
			onAccent: '#261D15'
		},
		dark: {
			bg: '#161310',
			surface: '#1E1B18',
			text: '#EAE7E3',
			muted: '#A29E98',
			border: '#36322D',
			accent: '#EDB345',
			onAccent: '#211911'
		},
		semantic: {
			success: '#488055',
			warning: '#D18F1F',
			danger: '#C9302D',
			info: '#1479B0'
		}
	},
	shape: { radius: 10 },
	spacing: { density: 'comfortable' }
};

// ------------------------------------------------------------------- fonts

export type FontDef = { label: string; stack: string; category: 'serif' | 'sans' | 'mono' };

// Every family here is bundled through @fontsource and imported in layout.css.
// Nothing is fetched from Google — the dashboard has to work with no network.
export const FONTS: FontDef[] = [
	{ label: 'Space Grotesk', stack: "'Space Grotesk Variable', system-ui, sans-serif", category: 'sans' },
	{ label: 'Inter', stack: "'Inter Variable', system-ui, sans-serif", category: 'sans' },
	{ label: 'IBM Plex Sans', stack: "'IBM Plex Sans Variable', system-ui, sans-serif", category: 'sans' },
	{ label: 'Public Sans', stack: "'Public Sans Variable', system-ui, sans-serif", category: 'sans' },
	{ label: 'System UI', stack: 'system-ui, -apple-system, sans-serif', category: 'sans' },
	{ label: 'Fraunces', stack: "'Fraunces Variable', Georgia, serif", category: 'serif' },
	{ label: 'Source Serif 4', stack: "'Source Serif 4 Variable', Georgia, serif", category: 'serif' },
	{ label: 'Lora', stack: "'Lora Variable', Georgia, serif", category: 'serif' },
	{ label: 'Georgia', stack: "Georgia, 'Times New Roman', serif", category: 'serif' },
	{ label: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, monospace", category: 'mono' },
	{ label: 'JetBrains Mono', stack: "'JetBrains Mono Variable', ui-monospace, monospace", category: 'mono' },
	{ label: 'System Mono', stack: "ui-monospace, 'SF Mono', Menlo, monospace", category: 'mono' }
];

export function fontStack(label: string): string {
	return FONTS.find((f) => f.label === label)?.stack ?? label;
}

export const SCALE_RATIOS: { value: number; label: string }[] = [
	{ value: 1.125, label: '1.125 · Major second' },
	{ value: 1.2, label: '1.200 · Minor third' },
	{ value: 1.25, label: '1.250 · Major third' },
	{ value: 1.333, label: '1.333 · Perfect fourth' },
	{ value: 1.414, label: '1.414 · Augmented fourth' },
	{ value: 1.5, label: '1.500 · Perfect fifth' }
];

export const DENSITY: Record<DesignConfig['spacing']['density'], number> = {
	compact: 0.875,
	comfortable: 1,
	roomy: 1.125
};

// --------------------------------------------------------------- derivation

// Dark *surfaces* need a bigger lightness step than light ones to read as
// separate — the same 0.02 that clearly lifts a card off white disappears
// against near-black.
const SURFACE_SCALE: Record<Mode, number> = { light: 1, dark: 2.2 };

// Dark *text* is the opposite: it already sits near the top of the range, so
// the same nudge that gently softens black on paper washes it out on console.
const TEXT_SCALE: Record<Mode, number> = { light: 1, dark: 0.65 };

/** The full set of CSS variables for one mode. */
export function deriveVars(config: DesignConfig, mode: Mode): Record<string, string> {
	const p = config.color[mode];
	const scale = SURFACE_SCALE[mode];
	const textScale = TEXT_SCALE[mode];

	const bg = hexToOklch(p.bg);
	const surface = hexToOklch(p.surface);
	const text = hexToOklch(p.text);
	const muted = hexToOklch(p.muted);
	const border = hexToOklch(p.border);
	const accent = hexToOklch(p.accent);
	const onAccent = hexToOklch(p.onAccent);

	/** A background tinted `t` of the way toward the text colour. */
	const tint = (t: number): Oklch => mix(bg, text, t * scale);

	// shadcn's --primary is the filled-button neutral, not the brand colour —
	// it tracks the text colour, pulled a touch toward the background.
	const primary = mix(text, bg, 0.04 * textScale);

	// The sidebar sits *behind* the content in both modes, so it steps away
	// from the background rather than toward the text.
	const sidebar = lighten(bg, -0.022);

	const vars: Record<string, Oklch | string> = {
		'--background': bg,
		'--foreground': text,
		'--card': surface,
		'--card-foreground': text,
		'--popover': surface,
		'--popover-foreground': text,
		'--primary': primary,
		'--primary-foreground': bg,
		'--secondary': tint(0.055),
		'--secondary-foreground': primary,
		'--muted': tint(0.05),
		'--muted-foreground': muted,
		// NOTE: shadcn's --accent is the subtle *hover* surface, not the brand
		// colour. The accent token you pick becomes --signal / --ring / the
		// chart series; this one is a background with a trace of it mixed in.
		'--accent': mix(tint(0.05), accent, 0.03),
		'--accent-foreground': primary,
		'--destructive': hexToOklch(config.color.semantic.danger),
		'--border': border,
		'--input': border,
		'--ring': accent,

		'--signal': accent,
		'--signal-foreground': onAccent,

		// One picked hue fanned into a series. Fixed rotations rather than
		// arbitrary colours, so a new accent moves the whole set together.
		'--chart-1': accent,
		'--chart-2': rotate({ ...accent, c: accent.c * 0.6 }, 126),
		'--chart-3': mix(text, bg, 0.35),
		'--chart-4': rotate(accent, -34),
		'--chart-5': rotate({ ...accent, c: accent.c * 0.6 }, 76),

		'--sidebar': sidebar,
		'--sidebar-foreground': mix(text, bg, 0.09 * textScale),
		'--sidebar-primary': accent,
		'--sidebar-primary-foreground': onAccent,
		'--sidebar-accent': mix(sidebar, text, 0.06 * scale),
		'--sidebar-accent-foreground': text,
		'--sidebar-border': border,
		'--sidebar-ring': accent,

		'--success': hexToOklch(config.color.semantic.success),
		'--warning': hexToOklch(config.color.semantic.warning),
		'--info': hexToOklch(config.color.semantic.info)
	};

	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(vars)) {
		out[key] = typeof value === 'string' ? value : css(value);
	}
	return out;
}

/** Variables that are the same in both modes — type, shape, density. */
export function deriveShellVars(config: DesignConfig): Record<string, string> {
	const t = config.typography;
	return {
		'--radius': `${config.shape.radius / 16}rem`,
		'--font-sans': fontStack(t.bodyFont),
		'--font-mono': fontStack(t.monoFont),
		'--font-heading': fontStack(t.headingFont),
		'--spacing': `${0.25 * DENSITY[config.spacing.density]}rem`,
		'--type-scale': String(t.scaleRatio),
		'--heading-weight': String(t.headingWeight),
		'--body-weight': String(t.bodyWeight),
		'--heading-leading': String(t.headingLineHeight),
		'--body-leading': String(t.bodyLineHeight)
	};
}

const block = (selector: string, vars: Record<string, string>) =>
	`${selector}{${Object.entries(vars)
		.map(([k, v]) => `${k}:${v}`)
		.join(';')}}`;

/** The whole override stylesheet, ready to drop into a <style> tag.
 *
 *  Note the doubled selectors. SvelteKit renders `<svelte:head>` content
 *  *before* it injects the stylesheet links, so a plain `:root` / `.dark` pair
 *  would lose to the identical selectors in layout.css on source order alone —
 *  the saved theme would silently do nothing while the live preview (appended
 *  at runtime, and therefore last) appeared to work. `:root:root` and
 *  `:root.dark` outrank them on specificity instead of position, so this wins
 *  wherever it lands in the document. */
export function toCss(config: DesignConfig): string {
	const t = config.typography;
	return [
		block(':root:root', { ...deriveShellVars(config), ...deriveVars(config, 'light') }),
		block(':root.dark', deriveVars(config, 'dark')),
		`html{font-size:${t.baseSize}px}`,
		`body{font-weight:var(--body-weight);line-height:var(--body-leading)}`,
		// Headings get their own family and rhythm; sizes stay on Tailwind's
		// utilities so the scale ratio drives the specimen, not the whole app.
		// `:where()` keeps this at zero specificity so any explicit font-* or
		// leading-* utility on a heading still wins.
		`:where(h1,h2,h3,h4,h5,h6){font-family:var(--font-heading);font-weight:var(--heading-weight);line-height:var(--heading-leading)}`
	].join('\n');
}

/** Fill in anything missing from a stored config — a token added later must not
 *  blank out a palette saved before it existed. */
export function withDefaults(stored: unknown): DesignConfig {
	const c = (stored ?? {}) as Partial<DesignConfig>;
	return {
		typography: { ...DEFAULTS.typography, ...(c.typography ?? {}) },
		color: {
			light: { ...DEFAULTS.color.light, ...(c.color?.light ?? {}) },
			dark: { ...DEFAULTS.color.dark, ...(c.color?.dark ?? {}) },
			semantic: { ...DEFAULTS.color.semantic, ...(c.color?.semantic ?? {}) }
		},
		shape: { ...DEFAULTS.shape, ...(c.shape ?? {}) },
		spacing: { ...DEFAULTS.spacing, ...(c.spacing ?? {}) }
	};
}
