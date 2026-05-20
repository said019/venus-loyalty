# Venus — Design tokens

## Color strategy

**Restrained.** Warm cream surfaces, one olive accent under 10% of the screen.

All colors in OKLCH. No `#000` / `#fff`. Every neutral tinted toward the brand hue (≈85deg, low chroma).

### Light (default)

```css
--bg:          oklch(96.5% 0.012 88);   /* warm oat */
--surface:     oklch(99% 0.006 88);     /* cream paper */
--surface-2:   oklch(93.5% 0.014 88);   /* recessed */
--ink:         oklch(22% 0.012 80);     /* warm charcoal — never #000 */
--ink-2:       oklch(45% 0.012 80);     /* secondary */
--ink-3:       oklch(60% 0.010 80);     /* muted */
--line:        oklch(88% 0.014 88);     /* hairline */
--line-2:      oklch(82% 0.018 88);     /* stronger */

--olive:       oklch(58% 0.075 120);    /* #8c9668 in OKLCH-ish — primary accent */
--olive-deep:  oklch(48% 0.085 120);    /* hover / pressed */
--olive-soft:  oklch(94% 0.022 120);    /* tint background */

--ok:          oklch(62% 0.115 155);    /* sage-leaning success */
--warn:        oklch(72% 0.110 80);     /* warm amber */
--err:         oklch(58% 0.140 28);     /* rose, not red */
--info:        oklch(58% 0.080 220);    /* muted slate-blue */
```

### Dark (evening)

Warm dim, **not** tech-black. Charcoal tinted toward the same hue.

```css
--bg:          oklch(18% 0.012 80);     /* deep warm charcoal */
--surface:     oklch(22% 0.014 80);
--surface-2:   oklch(26% 0.016 80);
--ink:         oklch(95% 0.012 88);
--ink-2:       oklch(78% 0.012 88);
--ink-3:       oklch(60% 0.010 88);
--line:        oklch(30% 0.018 80);
--line-2:      oklch(38% 0.020 80);

--olive:       oklch(68% 0.080 120);
--olive-deep:  oklch(78% 0.090 120);
--olive-soft:  oklch(28% 0.030 120);
```

## Typography

- **Display / headlines:** Playfair Display, weight 500–600, tracking -0.015em
- **Body / UI:** DM Sans, weight 400/500/600
- Body line-height 1.55, max width 65ch.
- Scale (1.25 ratio): 13 / 15 / 19 / 24 / 30 / 38

## Spacing

Base unit 4px. Vary rhythm — don't repeat the same padding everywhere.

- Compact (chips, inline): 8 / 12
- Default (cards, sections): 18 / 22 / 28
- Pane breathing room: 36 / 48

## Radii

12 / 16 / 22 — soft, never sharp.

## Elevation

Almost flat. Use hairline `--line` borders instead of shadows. One soft shadow allowed for the dialog only: `0 24px 60px oklch(22% 0.012 80 / 0.18)`.

## Components

### Tabs (recepción nav)

Horizontal pills. Inactive: surface + hairline border + muted ink. Active: olive fill, white ink, no glow. Tap target 48px min.

### KPI tile

Small uppercase label (caps, 11px, tracked +0.14em, muted) above a large Playfair number. No "card chrome" — just spacing and a 1px bottom rule between groups.

### Cita card

Time on the left in Playfair (olive). Client + service in the middle. Actions on the right. 22px padding. Hairline border, no shadow. On hover: border darkens to `--line-2`. Status: small pill with leading dot, soft tint background.

### Buttons

- Primary: olive fill, white ink, 12px radius, 44px min height.
- Ghost: transparent + hairline border.
- Danger: hairline border in `--err`, ink in `--err`, transparent until hover.
- Active state: translateY(1px), no glow.

### Inputs

Surface bg, hairline border. Focus: 2px olive ring (not shadow). No "floating label" gimmicks.

### Dialog (Nueva cita)

Centered, 22px radius, 28px padding. One soft shadow + backdrop in warm charcoal at 55% with 4px blur.

## Motion

- Tab change: 200ms opacity + 8px translate, ease-out-quart.
- Hover: 120ms color/border only. Never animate width/height.
- KPI skeleton: 1.4s shimmer.

## Bans (project-specific)

- No emojis in UI chrome (icons only via Font Awesome, used sparingly).
- No exclamation marks except in user-typed copy.
- No gradient backgrounds spanning the page. The page is matte.
- No glassmorphism, no neon glows, no hero-metric template.
