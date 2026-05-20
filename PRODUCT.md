# Venus Cosmetología — Product

## Register

**product** — admin & operations UI for a cosmetology / spa business. Design serves the day-to-day work, it is not the marketing surface.

## Product Purpose

Venus is a boutique cosmetology studio in San Juan del Río, Querétaro. The platform runs the studio: clients, loyalty cards, appointments, payments, coffee bar POS, Yiyuan skin analyses, WhatsApp notifications. Two main panels: `/admin.html` (owner, full access) and `/recepcion.html` (front-desk staff, scoped permissions).

This document covers the **recepción panel** specifically.

## Users

- **The receptionist.** Adult woman, works full shift behind the front desk of the studio. Uses a tablet (iPad-style, 10–13 inches), occasionally a phone. Light ambient is warm — natural light during the day, soft incandescent in the evening. She is talking to clients while using the screen; hands sometimes wet from cleaning. She is not a technologist.
- **Not the owner.** The owner has the full admin. Receptionist must not see finances, dashboards, or pricing controls.

## Brand / tone

Calm, refined, warm. The studio sells care and quality, not a tech product. Surfaces feel like the studio itself: clean cream walls, olive plant accents, soft daylight, Playfair Display on the wall menu. Not corporate, not "saas dashboardy", not nightclub-dark.

Voice in copy: warm Spanish (Mexico), clear, never effusive. No exclamation marks chained, no emoji walls. "Sin citas hoy" reads better than "🎉 ¡Día libre!".

## Anti-references

- ❌ Generic dark SaaS dashboards (Linear, Vercel admin). Wrong mood — the studio is warm and bright.
- ❌ "Healthcare blue + white" sterility. This is a beauty studio, not a clinic.
- ❌ Bootstrap default look (gray rounded cards, blue buttons).
- ❌ Material Design metallic chips, Google fonts default.
- ❌ Neon olive on pure black — that's the AI training-data reflex for "premium dashboard".

## Strategic principles

1. **Glance-and-act.** Receptionist looks at the screen for 1–3 seconds, then acts. Hierarchy must do the work — what's urgent jumps, what's done recedes.
2. **Touchable.** Tap targets ≥44px (Apple HIG). Spacing generous because thumbs miss.
3. **Surfaces feel like the studio.** Cream / oat backgrounds, oliva (#8c9668) accent restrained, never as a wall. Black is replaced by `oklch(15% 0.01 80)` warm charcoal.
4. **One thing per surface.** Each tab does one job. No nested modals, no nested cards.
5. **Optional dark theme is for evenings.** Default light. Dark mode swaps to warm dim, never cold tech-black.

## register

product
