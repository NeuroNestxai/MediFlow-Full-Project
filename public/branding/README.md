# MediFlow branding assets

Source of truth: `MediFlow.pdf` (approved Canva artwork, single 940×940 page).

Extraction: the page was rasterized with PyMuPDF at 4× (3762×3762 px), preserving
the approved teal→blue→violet gradients and the serif "MediFlow" wordmark exactly
(no recolor, no redraw, no font substitution). The near-white artwork background
(#fefdfb) was keyed to transparency by distance; artwork RGB was left untouched.
Content bounding boxes were auto-detected and each asset tightly trimmed.

| File | Contents | Intended use |
|------|----------|--------------|
| `mediflow-symbol.png` | Symbol only (ring of nodes + river + figure), transparent, square | Icon-only mark, mobile/compact identity, favicon source |
| `mediflow-lockup.png` / `.webp` | Symbol + "MediFlow" wordmark, horizontal, transparent | Desktop/tablet app header |
| `mediflow-full.png` / `.webp` | Symbol + wordmark + descriptor + tagline (full composition), transparent | Large brand areas |

App icons generated from the symbol live at `src/app/icon.png`, `src/app/apple-icon.png`,
`src/app/favicon.ico` (Next.js App Router auto-detects these).

Assets are premultiplied over near-white, so use them on light surfaces (all current
usages are). The symbol and lockup also read cleanly on dark; the dense full
composition is intended for light backgrounds.
