# 08. The Design System — Lumen

The Studio OS design language is **Lumen**: modern, motion-first, and consistent
everywhere. It replaces the earlier "Quantum Elevation" system. Lumen's job is to
make the app feel *alive and premium by default* — so that building a studio feels
like a tool you'd love, not a form you tolerate — while staying one coherent system
(the framework's usability law, [00-FRAMEWORK](00-FRAMEWORK.md) §1).

## The Absolute Law of Centralization (unchanged)

Every visual decision lives in **`src/app/globals.css`**. Because of this, the whole
app was moved onto Lumen from that single file.

1. **No `.module.css` files.**
2. **No inline `style={{…}}` for structural layout, colour, or shadow.** (Legacy
   pages still do this; removing it is an ongoing cleanup and is what unlocks dark
   mode.)
3. **The `.q-` namespace.** Every element uses the `.q-` utility/component classes
   (`.q-card`, `.q-btn`, `.q-input`, `.q-badge`, `.q-table`, …). The `.q-*` class and
   `--q-*` token names are kept as the stable API; Lumen redefines what they *mean*.

## Aesthetic

- **Neutrals:** a warm, gallery-paper ramp — ground `#F4F3F0`, white surfaces, a
  near-black ink `#1A1A1D`. Chosen, not defaulted.
- **Accent:** a confident **ultramarine `#3B47D6`**, answered by a warm **amber
  `#EE9B3D`** counterpoint. Energy comes from the cool/warm interplay, not volume.
- **Semantic colours** (success/warning/danger) are separate from the accent.

## Type

- **Sans:** Inter, set large and tight for display (`-0.03em`, weight 680), calm and
  readable for body.
- **Mono:** `--q-font-mono` for labels, eyebrows, table headers, and data — a modern
  "tool" voice suited to a builder. Use `tabular-nums` wherever digits align.

## Motion — the point, not the garnish

One motion language, applied everywhere, so the app moves like a single object:

- `--q-ease: cubic-bezier(.22,.8,.28,1)` — the standard curve.
- `--q-spring: cubic-bezier(.34,1.42,.5,1)` — physical settle for toggles, indicators.
- `--q-dur-1/2/3` = 130 / 240 / 440 ms.

Everything interactive **lifts on hover, presses on `:active`, and settles with a
spring.** Nothing is inert. Honour `prefers-reduced-motion` (globals.css already does).

## Components

Defined in globals.css: `.q-btn` (`-primary` = ultramarine, `-secondary`, `-outline`),
`.q-card` (+ `-interactive` lift), `.q-input/.q-select/.q-textarea/.q-label`,
`.q-badge` (`-success/-warning/-error/-neutral`), `.q-table` (mono headers, hover
rows), `.q-state-*` (the state grammar), `.q-glass-panel`, jewel gradients for the
launcher tiles. All carry Lumen motion.

## Theming

Light-only for now. The token architecture is dark-ready, but the app still has
hardcoded light colours in inline styles; **dark mode ships once those are removed.**

## Status

Foundation is live (`globals.css`). Rollout is progressive: legacy inline styles are
being replaced with `.q-` classes screen by screen, starting with the visual builder
(the showcase surface). See the approved living preview ("Lumen") for the target feel.
