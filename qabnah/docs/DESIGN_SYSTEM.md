# Qabnah Design System v2 — "Night & Sand"

The first UI pass was functional but flat: beige cards, letter avatars instead of photos, no depth. v2 is the
standard for every surface (website, storefront, merchant portal, admin, iOS, Android).

**Principles (non-negotiable)**
1. **Real, never cartoon.** Photography for food, products and people. No clip-art, no emoji icons, no flat
   illustrations. 3D only where it is physically plausible (the website hero studio scene).
2. **Photo-first commerce.** Wherever a product or store appears, its photo leads. Text never sits on a plain beige
   box where a photo should be. Missing image → the branded placeholder (below), never a grey box or a letter.
3. **Arabic first.** RTL is the default layout. Arabic and English are separate complete experiences — never mix
   languages inside one sentence or label.
4. **Brand colours only.** Green, saffron, night, sand and their tints. Merchant storefronts additionally use that
   merchant's own brand/accent colours.
5. **Depth with restraint.** Two elevation levels, soft layered shadows, one dark "night" surface per screen at most.
6. **No invented content.** No fake ratings, testimonials, download counts or partner logos.

## Tokens

### Colour
| Token | Light value | Use |
|---|---|---|
| `night` | `#061A16` | Website hero, app headers, sidebars, floating cart bar, captain app background |
| `night-2` | `#0B2A25` | Raised surfaces on night |
| `night-line` | `#1B3F38` | Borders on night |
| `primary` | `#0E7C66` | Brand, primary buttons, links, active states |
| `primary-deep` | `#095C4C` | Pressed/hover |
| `primary-soft` | `#E3F3EF` | Tinted backgrounds, selected rows |
| `saffron` | `#F4A300` | The single accent: primary CTA on night surfaces, live/active indicators, price highlights |
| `saffron-soft` | `#FEF3D6` | Accent tint |
| `sand` | `#FAF6EE` | Page background (light) |
| `surface` | `#FFFFFF` | Cards |
| `ink` | `#0B1F1C` | Text |
| `muted` | `#5B6B68` | Secondary text |
| `line` | `#E8E3D8` | Hairlines |
| `success` `#15803D` · `warning` `#B45309` · `danger` `#C2410C` · `info` `#1D4ED8` | | Status only — never decoration |

On night surfaces text is `#F3F7F5`, secondary `#A9BDB8`.

### Type
- **IBM Plex Sans Arabic** (Arabic) and **IBM Plex Sans** (Latin), self-hosted (`@fontsource`), weights 400/500/600/700.
  Mobile: bundle the same fonts (iOS `UIAppFonts`, Android `res/font`).
- Scale (px): display 44/52 · h1 30/38 · h2 22/30 · h3 17/26 · body 15/24 · small 13/20 · micro 11/16 (uppercase
  Latin only, +0.04em). Arabic line-height is 1.7× for body.
- Prices: tabular numerals, weight 700; currency label (`ر.ع.` / `OMR`) at 0.75× size, weight 500, `muted`.

### Shape, spacing, elevation
- Radius: 10 (inputs, chips) · 16 (cards, images) · 24 (sheets, hero media) · 999 (pills, FAB).
- Spacing: 4-pt grid — 4, 8, 12, 16, 20, 24, 32, 48, 72.
- Elevation 1 (cards): `0 1px 2px rgba(11,31,28,.05), 0 6px 16px rgba(11,31,28,.06)`.
  Elevation 2 (floating bars, sheets, popovers): `0 2px 6px rgba(11,31,28,.08), 0 18px 48px rgba(11,31,28,.16)`.
- Hit targets ≥ 44 px. Focus ring: 3 px `rgba(14,124,102,.35)`.

### Motion
150 ms for presses, 220–280 ms for sheets and page transitions, `cubic-bezier(.2,.8,.2,1)`. Respect reduced motion.
No bouncing, no confetti.

## Components

### Photo
- Product photo: 4:3 in lists (min 96×72 on phone, 128×96 on desktop), 16:10 in the product sheet, radius 16,
  `object-fit: cover`.
- Store cover: 16:9 on cards, full-bleed on the storefront header with a bottom gradient
  `linear-gradient(to top, rgba(6,26,22,.85), rgba(6,26,22,0) 60%)`; store name and status sit on the gradient in white.
- **Branded placeholder** (no image): `night-2` → `primary-deep` diagonal gradient with the category glyph
  (outlined, 1.5 px stroke, 40% white) centred. Merchant storefronts tint it with the merchant's brand colour.
- Store logo: 56 px rounded-square (radius 14) with a 2 px white ring, overlapping the cover's bottom edge.
  No logo → the merchant's initial in white on their brand colour (this is the only allowed letter avatar).

### Buttons
- Primary: `primary` fill, white text, radius 12, height 48 (44 compact). On night surfaces the primary action is
  **saffron fill with ink text**.
- Secondary: white fill, 1 px `line`, ink text. Tertiary: text only, `primary`.
- Destructive: `danger` text, fills only in confirmation dialogs.
- Full-width sticky CTA bars on phone: night background, saffron button, safe-area padding.

### Cards and lists
- Card: `surface`, radius 16, elevation 1, 16 px padding (no border). Never nest cards.
- Product row (storefront): photo on the leading side (right in RTL), title 15/600, one-line description `muted`,
  price row with a circular 36 px add button in the store's brand colour.
- Store card (website, consumer home): cover 16:9 with open/closed pill top-start, logo overlapping, name 17/600,
  meta row (category · prep time · delivery fee from) in `muted`.
- Order card (merchant board): number + age on one line, customer, items summary, payment pill, primary action full
  width at the bottom. New orders pulse a saffron edge for 6 s.

### Status
Pills with a 6 px dot: neutral, info, success, warning, danger. Order timeline: horizontal on desktop, vertical on
phone, completed steps `primary`, current step saffron dot with a soft halo.

### Navigation
- **Storefront (public):** transparent header over the cover → solid white on scroll; sticky horizontal category
  tabs; floating cart bar (night, saffron CTA) once the cart has items.
- **Merchant portal / admin:** night sidebar (logo, sections, user) with saffron active marker; white top bar; sand
  content area; cards on sand. Tablet: sidebar collapses to icons. Phone: bottom tab bar (merchant) / drawer (admin).
- **Consumer app:** bottom tab bar (white, active icon `primary` with saffron dot), large title headers, photo-led
  home (hero banner carousel → category chips with photos → store cards).
- **Captain app:** dark by default (`night` background — readable outdoors and at night): map-first home, giant
  online toggle, offer card as a full-height sheet with countdown ring in saffron, one primary action per screen.

### Maps
Tiles need a production provider; style = muted light for consumer/merchant, dark for captain and admin live ops.
Route = 4 px saffron line with white casing; pickup = green pin, drop-off = saffron dot, captain = white dot with a
heading wedge.

### Empty, loading, error
Skeleton shimmer for loading (no spinners on full pages). Empty states: one line of plain text plus the action
that fixes it; no illustrations. Errors say what happened and what to do.

## Do / Don't
- Do lead with the photo; do keep one saffron element per view; do write numbers in the reader's language digits.
- Don't use beige-on-beige cards, default system blue, emoji, drop shadows on text, gradients other than the two
  defined (cover scrim, placeholder), or more than two font weights in one component.

## Reference implementation
- Tokens and base CSS: `apps/shared/src/ui/styles.css`.
- 3D hero: `apps/site/src/scene.ts`.
- Sample imagery (illustrative, AI-generated previews): `apps/merchant/public/sample/` — replace with real
  photography before launch.
