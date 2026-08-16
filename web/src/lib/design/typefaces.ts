// The font library: typefaces collected for design work — logos, posters,
// covers — and what's known about each one.
//
// Deliberately *not* the FONTS list in tokens.ts. That list answers "what may
// the dashboard set itself in", so every entry has to be bundled, readable at
// 13px, and boring on purpose. This one answers "what type do I have to work
// with", so it holds display faces that would be unusable as UI, and — the
// point of the `licence` field — faces that can't be bundled at all.
//
// A face with no `family` is catalogued but has no specimen: either the licence
// is commercial or the file hasn't been vendored yet. FontSpecimen renders that
// state explicitly instead of quietly falling back to a system font, which
// would show you Arial and call it Druk.

export type Licence = 'libre' | 'commercial' | 'unknown';
export type TypefaceKind = 'display' | 'sans' | 'serif' | 'mono';

/** A variable axis the specimen controls can drive. `def` is where it starts. */
export interface Axis {
	tag: string;
	label: string;
	min: number;
	max: number;
	def: number;
}

export interface Typeface {
	id: string;
	name: string;
	foundry: string;
	designer?: string;
	kind: TypefaceKind;
	licence: Licence;
	/** CSS stack. `null` = catalogued, no file, no specimen. */
	family: string | null;
	/** Why there's no specimen. Only meaningful when `family` is null. */
	unavailable?: string;
	/** Where the face came from / where to buy it. */
	url?: string;
	/** One line on what the face is *for* — the reason it's in the library. */
	note?: string;
	/** Variable axes, if any. Fixed faces omit this. */
	axes?: Axis[];
	/** Static weight to set the specimen in when there's no wght axis. */
	weight?: number;
	/** Sample text that shows this particular face off better than the default. */
	sample?: string;
	tags?: string[];
	/**
	 * Layered rendering: full CSS stacks drawn over each other on the same
	 * text, first entry at the bottom. Only meaningful for families whose cuts
	 * share metrics (Flor de Ruina). FontSpecimen shades the layers from faint
	 * to full so the stack reads as one letterform in states of change;
	 * `family` stays the top layer so the load check and note blocks work.
	 */
	layers?: string[];
}

const WGHT = (min: number, max: number, def: number): Axis => ({
	tag: 'wght',
	label: 'Weight',
	min,
	max,
	def
});

const WDTH = (min: number, max: number, def: number): Axis => ({
	tag: 'wdth',
	label: 'Width',
	min,
	max,
	def
});

export const TYPEFACES: Typeface[] = [
	{
		id: 'archivo',
		name: 'Archivo',
		foundry: 'Omnibus-Type',
		kind: 'sans',
		licence: 'libre',
		family: "'Archivo Variable', system-ui, sans-serif",
		url: 'https://fonts.google.com/specimen/Archivo',
		// The open answer to Monument Extended: push width to 125 and weight to
		// 900 and it holds the same wide brutalist nameplate, without a licence.
		note: 'Grotesk with a real width axis to 125% — at full width and weight it does the wide brutalist nameplate.',
		axes: [WGHT(100, 900, 900), WDTH(62, 125, 125)],
		tags: ['machine', 'grotesk', 'variable', 'loved']
	},
	{
		id: 'michroma',
		name: 'Michroma',
		foundry: 'Vernon Adams',
		kind: 'display',
		licence: 'libre',
		family: "'Michroma', system-ui, sans-serif",
		url: 'https://fonts.google.com/specimen/Michroma',
		note: 'Eurostile-lineage square techno. Instant sci-fi; wants letterspacing and not much text.',
		weight: 400,
		tags: ['machine', 'techno']
	},
	{
		id: 'terminal-grotesque',
		name: 'Terminal Grotesque',
		foundry: 'Velvetyne',
		designer: 'Raphaël Bastide',
		kind: 'display',
		licence: 'libre',
		family: "'Terminal Grotesque', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/terminal-grotesque/',
		note: 'Pixel-corrupted grotesk — human and machine in the same letterform. Good support type.',
		weight: 400,
		tags: ['machine', 'blood', 'velvetyne', 'loved']
	},
	{
		id: 'terminal-grotesque-open',
		name: 'Terminal Grotesque Open',
		foundry: 'Velvetyne',
		designer: 'Raphaël Bastide, jjjlllnnn',
		kind: 'display',
		licence: 'libre',
		family: "'Terminal Grotesque Open', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/terminal-grotesque/',
		note: 'The opened-up cut of Terminal Grotesque — same corruption, more air.',
		weight: 400,
		tags: ['velvetyne', 'loved']
	},
	{
		id: 'pilowlava',
		name: 'Pilowlava',
		foundry: 'Velvetyne',
		designer: 'Anton Moglia, Jérémy Landes',
		kind: 'display',
		licence: 'libre',
		family: "'Pilowlava', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/pilowlava/',
		note: 'Molten organic display — the blood against the robot. Pairs with a rigid machine face.',
		weight: 400,
		sample: 'BLOOD',
		tags: ['blood', 'velvetyne']
	},
	{
		id: 'pilowlava-atome',
		name: 'Pilowlava Atome',
		foundry: 'Velvetyne',
		designer: 'Anton Moglia, Jérémy Landes',
		kind: 'display',
		licence: 'libre',
		family: "'Pilowlava Atome', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/pilowlava/',
		note: 'Pilowlava broken into parts — more graphic, less legible, good very large.',
		weight: 400,
		sample: 'BLOOD',
		tags: ['blood', 'velvetyne']
	},
	{
		id: 'flor-de-ruina',
		name: 'Flor de Ruina (layered)',
		foundry: 'Velvetyne',
		designer: 'Felipe Sanzana',
		kind: 'display',
		licence: 'libre',
		// Top layer as the plain family: it's what the load check confirms and
		// what a note's /font block renders (one element can't stack cuts).
		family: "'Flor de Ruina Ruina', system-ui, sans-serif",
		layers: [
			"'Flor de Ruina Semilla', system-ui, sans-serif",
			"'Flor de Ruina Germen', system-ui, sans-serif",
			"'Flor de Ruina Flor', system-ui, sans-serif",
			"'Flor de Ruina Fractura', system-ui, sans-serif",
			"'Flor de Ruina Ruina', system-ui, sans-serif"
		],
		url: 'https://velvetyne.fr/fonts/flor-de-ruina/',
		note: 'All five cuts of the life cycle stacked on shared metrics, shaded faint to full — the seed still visible inside the ruin. Built to be layered in colours.',
		weight: 400,
		tags: ['blood', 'velvetyne', 'layered', 'loved']
	},
	{
		id: 'flor-de-ruina-semilla',
		name: 'Flor de Ruina Semilla',
		foundry: 'Velvetyne',
		designer: 'Felipe Sanzana',
		kind: 'display',
		licence: 'libre',
		family: "'Flor de Ruina Semilla', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/flor-de-ruina/',
		note: 'The seed — stage one of the cycle, the letterform still closed.',
		weight: 400,
		tags: ['blood', 'velvetyne', 'loved']
	},
	{
		id: 'flor-de-ruina-germen',
		name: 'Flor de Ruina Germen',
		foundry: 'Velvetyne',
		designer: 'Felipe Sanzana',
		kind: 'display',
		licence: 'libre',
		family: "'Flor de Ruina Germen', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/flor-de-ruina/',
		note: 'Germination — the form starts to open.',
		weight: 400,
		tags: ['blood', 'velvetyne', 'loved']
	},
	{
		id: 'flor-de-ruina-flor',
		name: 'Flor de Ruina Flor',
		foundry: 'Velvetyne',
		designer: 'Felipe Sanzana',
		kind: 'display',
		licence: 'libre',
		family: "'Flor de Ruina Flor', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/flor-de-ruina/',
		note: 'Full bloom — the most complete cut, the one to layer under.',
		weight: 400,
		tags: ['blood', 'velvetyne', 'loved']
	},
	{
		id: 'flor-de-ruina-fractura',
		name: 'Flor de Ruina Fractura',
		foundry: 'Velvetyne',
		designer: 'Felipe Sanzana',
		kind: 'display',
		licence: 'libre',
		family: "'Flor de Ruina Fractura', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/flor-de-ruina/',
		note: 'Withering — the stroke fissures.',
		weight: 400,
		tags: ['blood', 'velvetyne', 'loved']
	},
	{
		id: 'flor-de-ruina-ruina',
		name: 'Flor de Ruina Ruina',
		foundry: 'Velvetyne',
		designer: 'Felipe Sanzana',
		kind: 'display',
		licence: 'libre',
		family: "'Flor de Ruina Ruina', system-ui, sans-serif",
		url: 'https://velvetyne.fr/fonts/flor-de-ruina/',
		note: 'The ruin — what remains, and still reads. Life in the crack.',
		weight: 400,
		tags: ['blood', 'velvetyne', 'loved']
	},
	{
		id: 'bricolage-grotesque',
		name: 'Bricolage Grotesque',
		foundry: 'Mathieu Triay',
		kind: 'sans',
		licence: 'libre',
		family: "'Bricolage Grotesque Variable', system-ui, sans-serif",
		url: 'https://fonts.google.com/specimen/Bricolage+Grotesque',
		// Kept honest: its width axis compresses (75–100%), it doesn't expand.
		// It's here as an idiosyncratic text face, not as a Monument substitute.
		note: 'Idiosyncratic grotesk. Its width axis only narrows (75–100%), so it is not an extended option.',
		axes: [WGHT(200, 800, 700), WDTH(75, 100, 100)],
		tags: ['grotesk', 'variable']
	},
	{
		id: 'monument-extended',
		name: 'Monument Extended',
		foundry: 'Pangram Pangram',
		kind: 'display',
		licence: 'commercial',
		family: null,
		unavailable: 'Free for personal use only — commercial work needs a paid licence, so no file is bundled.',
		url: 'https://pangrampangram.com/products/monument-extended',
		note: 'Wide brutalist grotesk; reads like a machine nameplate at any size. Compare Archivo at width 125.',
		tags: ['machine', 'wishlist']
	},
	{
		id: 'druk',
		name: 'Druk',
		foundry: 'Commercial Type',
		kind: 'display',
		licence: 'commercial',
		family: null,
		unavailable: 'Retail licence from Commercial Type; no free cut exists.',
		url: 'https://commercialtype.com/catalog/druk',
		note: 'Ultra-heavy condensed — the poster-wall option.',
		tags: ['wishlist']
	}
];

export const getTypeface = (id: string): Typeface | undefined =>
	TYPEFACES.find((t) => t.id === id);

/** The default `font-variation-settings` for a face, or '' if it has no axes. */
export function defaultVariation(face: Typeface): string {
	if (!face.axes?.length) return '';
	return face.axes.map((a) => `"${a.tag}" ${a.def}`).join(', ');
}

/**
 * The bare family name inside a CSS stack — `'Pilowlava', sans-serif` →
 * `Pilowlava`. Used to match a face against the registered @font-face rules,
 * which is how the specimen knows whether it's really rendering the font.
 */
export function primaryFamily(stack: string): string {
	const first = stack.split(',')[0]?.trim() ?? '';
	return first.replace(/^['"]|['"]$/g, '');
}
