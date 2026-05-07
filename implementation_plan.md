# Design System Migration: Dynamic Resume Refiner → RoleBridge

## Audit Summary — Source Project (Dynamic Resume Refiner)

### Token System (`tokens.css`)
| Token Category | Values |
|---|---|
| **Surfaces** | `--color-bg: #0B1215` · `--color-surface: #111D1A` · `--color-surface-2: #162520` · `--color-surface-offset: #162520` · `--color-surface-dynamic: #1e3329` |
| **Primary accent** | `--color-primary: #3ECC90` · `--color-primary-hover: #5EDDA8` · `--color-primary-active: #2dad7a` · `--color-primary-highlight: rgba(62,204,144,0.08)` |
| **Text** | `--color-text: #E8ECE9` · `--color-text-muted: #6B8078` · `--color-text-faint: #4a5e55` |
| **Borders/Dividers** | `rgba(62,204,144,0.15)` — accent-tinted, not neutral white |
| **Radius** | `--radius-sm: 8px` · `--radius-lg/xl: 16px` · `--radius-full: 999px` |
| **Shadows** | Dark: glow-based `0 0 20px rgba(62,204,144,0.12)` · Light: elevation-based |
| **Transitions** | `--transition-fast: 0.2s ease` · `--transition-interactive: 0.3s ease` · `--transition-slow: 0.5s ease` |
| **Fonts** | `--font-heading: Clash Display` · `--font-body: Satoshi` · `--font-mono: JetBrains Mono` |
| **Spacing** | 4px base scale: `--space-1` through `--space-16` |
| **Layout** | `--content-wide: 1200px` · `--topbar-height: 72px` · `--sidebar-width: 240px` |

### Color Token Naming Convention
The **source uses `--color-*` naming** (`--color-bg`, `--color-surface`, `--color-primary`, `--color-text`, `--color-border`, `--color-divider`, etc.)

The **target uses `--bg-*`, `--accent`, `--text-*`, `--border-*` naming** — these are **different token names** referencing the same conceptual palette.

### Navbar (TopBar + LandingNav)
- `position: sticky/fixed`, `height: 72px`, `padding: 0 var(--space-6)`
- **Logo pattern**: 40×40px bordered box (`border: 2px solid var(--color-primary)`, `border-radius: var(--radius-sm)`) + wordmark beside it in Clash Display, `color: var(--color-primary)`
- Background: `var(--nav-scrolled-bg)` = `rgba(11,18,21,0.88)` + `backdropFilter: blur(20px)` on scroll
- Theme toggle: 40×40px circle, `background: var(--color-primary-highlight)`, on hover → full primary fill + 30° rotation, `transition: all 0.3s ease`

### Button System
- Base: `border-radius: 999px` (full pill), `font-weight: 600`, `transition: all 0.3s ease`
- Primary: `background: var(--color-primary)`, `color: var(--color-bg)`, `border: 2px solid var(--color-primary)`; hover → `translateY(-2px)` + `box-shadow: var(--shadow-md)`
- Secondary: transparent + `border: 2px solid var(--color-divider)`; hover → border goes primary color + `translateY(-2px)`
- Ghost: transparent; hover → `background: var(--color-primary-highlight)`, color → primary
- Sizes: `sm: 8px 18px/36px` · `md: 10px 20px/44px` · `lg: 14px 28px/52px`
- Disabled: `opacity: 0.5; cursor: not-allowed`

### Cards
- `background: var(--color-surface)`, `border: 1px solid var(--color-divider)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`
- Hover (card-hover): `translateY(-4px)` + `box-shadow: var(--shadow-md)`, `transition: 0.3s ease`

### Form Fields
- Input: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: var(--radius-lg)` (16px), `padding: 12px 16px`
- Focus ring: `border-color: var(--color-primary)` + `box-shadow: 0 0 0 3px var(--color-primary-highlight)`
- Labels: Satoshi, `font-size: 0.938rem`, `font-weight: 500`
- Error state: red border + `box-shadow: 0 0 0 3px var(--color-error-highlight)`
- Char count: JetBrains Mono, `0.813rem`, `color: var(--color-text-faint)`, right-aligned

### Pills / Tags / Badges
- Badge: JetBrains Mono, `0.813rem`, `padding: 6px 12px`, `border-radius: 999px`, colored bg from highlight token
- Section labels: mono, uppercase, `letter-spacing: 3px`, accent colored, `font-size: 0.813rem`
- Tag pills: mono, uppercase, `letter-spacing: 2px`, `padding: 6px 14px`, accent highlight bg

### Typography
- `h1: clamp(2rem,4vw,3rem)`, `h2: clamp(1.5rem,3vw,2rem)`, `h3: clamp(1.25rem,2.5vw,1.5rem)`
- All headings: Clash Display, `font-weight: 600`, `line-height: 1.15`
- Body: Satoshi, `1rem`, `line-height: 1.7`, `color: var(--color-text-muted)` for paragraphs
- Body base color: `var(--color-text)` on `body`

### Animations / Motion
- `pageIn`: `opacity 0 → 1`, `translateY(30px → 0)` — page entrance
- `cardIn`: `opacity 0 → 1`, `translateY(8px → 0)` — card entrance
- `shimmer`: skeleton loading, 1.5s infinite
- `pulse-dot`: 3-dot loader, scale+opacity
- `toast-in/out`: translate + scale
- `fadeIn`: simple opacity
- `spin`: 360° rotation for spinners

### Layout Tokens
- `--content-wide: 1200px` for landing sections; `max-width` capped per section
- `--topbar-height: 72px`
- Section padding: `var(--space-6)` horizontal (`24px`), vertical varies

---

## Mapping Strategy: Source → Target

### Token Name Reconciliation
The target uses different CSS variable names but same palette values. The migration will **rename all target tokens to match source naming exactly** while preserving all values. This unifies the variable namespace.

| Target (old) | Source (canonical) |
|---|---|
| `--bg-base` | `--color-bg` |
| `--bg-surface` | `--color-surface` |
| `--bg-surface-elevated` | `--color-surface-2` |
| `--accent` | `--color-primary` |
| `--accent-bright` | `--color-primary-hover` |
| `--accent-dim` | `--color-primary-highlight` |
| `--accent-glow` | `--shadow-md` (glow shadow) |
| `--text-primary` | `--color-text` |
| `--text-secondary` | `--color-text-muted` |
| `--text-muted` | `--color-text-faint` |
| `--border-subtle` | `--color-border` / `--color-divider` |
| `--shadow-base` | `--shadow-sm` |
| `--shadow-glow` | `--shadow-md` |
| `--transition-fast` | same name, value: `0.2s ease` |
| `--transition-normal` | `--transition-interactive` → `0.3s ease` |

### Structural Changes
- **App.jsx**: Add `data-theme` attribute at root; move ThemeToggle from floating position into a proper nav bar
- **Navbar**: Build a proper `<Navbar>` component matching the source's TopBar/LandingNav pattern — fixed, `72px`, logo-box + wordmark + theme toggle. Replace the floating `ThemeToggle` with this navbar.
- **CSS**: Completely rewrite `index.css` to use source token names + source component classes exactly. Preserve all RoleBridge-specific component classes (interview, timer, voice, etc.) but migrate them to source tokens.
- **Component JSX**: No structural logic changes. Class names and inline styles updated to use the canonical `--color-*` token names.

---

## Proposed Changes

### 1. `frontend/index.html`
#### [MODIFY] index.html
- Add font imports (Clash Display via fontshare, Satoshi via fontshare, JetBrains Mono via Google Fonts) — already present in `index.css`, move to HTML `<head>` for best performance

---

### 2. CSS — `frontend/src/index.css`
#### [MODIFY] index.css
Complete rewrite. This is the primary file. Changes:
- Replace all `--bg-*`, `--accent*`, `--text-*`, `--border-*` tokens with canonical `--color-*` source names
- Add all missing source tokens: `--color-surface-2`, `--color-surface-offset`, `--color-surface-dynamic`, `--color-divider`, `--color-text-faint`, `--color-primary-active`, `--color-primary-highlight`, `--color-error`, `--color-error-highlight`, `--color-warning`, `--color-warning-highlight`, `--color-success`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--nav-scrolled-bg`, spacing scale, layout tokens
- Port source `globals.css` base reset + typography exactly
- Port all source button classes: `btn-base`, `btn-size-*`, `btn-primary-variant`, `btn-secondary-variant`, `btn-ghost-variant`, `btn-danger-variant`
- Port source form classes: `field-group`, `field-label`, `field-input`, `field-error-msg`, `field-helper`, `textarea-input`
- Port source card classes: `card-hover`
- Port source animation keyframes: `pageIn`, `cardIn`, `shimmer`, `pulse-dot`, `toast-in`, `toast-out`, `spin`, `slideUp`, `fadeIn`, `float`
- Port source utility classes: `section-label`, `tag-pill`, `skeleton`, `sr-only`
- Keep all RoleBridge-specific selectors (`.timer-bar`, `.interview-page`, `.question-card`, `.voice-area`, etc.) but migrate them to canonical tokens
- Light theme block using `[data-theme="light"]` mirroring source exactly

---

### 3. App Shell — `frontend/src/App.jsx`
#### [MODIFY] App.jsx
- Add a `<Navbar>` component wrapping all routes (fixed topbar with RoleBridge logo-box + theme toggle)
- Apply `data-theme` to the root `<div>` (instead of floating `ThemeToggle`)
- Remove standalone `<ThemeToggle />` from root (it moves into Navbar)

---

### 4. New Component — `frontend/src/components/Navbar.jsx`
#### [NEW] Navbar.jsx
- Replicates source `LandingNav`/`TopBar` pattern exactly:
  - `position: fixed`, `height: 72px`, `padding: 0 24px`
  - Logo: 40×40 bordered box (`border: 2px solid var(--color-primary)`, `border-radius: 8px`) + "RB" initials + "RoleBridge" wordmark in Clash Display, accent color
  - Right side: theme toggle button (40×40 circle, primary-highlight bg, 30° rotation on hover)
  - Scroll-aware background: transparent → `var(--nav-scrolled-bg)` + blur on scroll
  - Theme state managed via `localStorage` + `data-theme` on `<html>`

---

### 5. Update ThemeToggle.jsx
#### [MODIFY] ThemeToggle.jsx
- Move theme toggle logic into Navbar — ThemeToggle.jsx can be simplified or removed (Navbar owns it)

---

### 6. Component Class Updates — LandingPage.jsx, SetupPage.jsx, InterviewPage.jsx, EndPage.jsx
#### [MODIFY] All page components
Class names remain the same (`.card`, `.btn-primary`, `.form-input`, etc.) because the CSS rewrite maps these to source tokens. However:
- `.btn-primary` in CSS will be updated to use `--color-primary` (not `--accent`)
- `.form-input` will use `--color-surface` (not `--bg-surface-elevated`)
- Cards will use `--color-surface`, `--color-divider`
- No JSX structural changes required — only CSS changes propagate automatically

---

## Unavoidable Deviations

1. **No Sidebar/MobileTabBar**: RoleBridge is a multi-page flow (Landing → Setup → Interview → Complete), not a sidebar-nav app. The source's sidebar and mobile tab bar are not applicable. Only the Navbar (topbar) pattern is replicated.
2. **No Lucide Icons**: RoleBridge uses plain JSX (no lucide-react). The Navbar theme toggle will use inline SVG (same icons, already present in ThemeToggle.jsx) instead of `<Sun>` / `<Moon>` from lucide.
3. **Content max-width**: Source landing uses `--content-wide: 1200px`. RoleBridge landing is intentionally narrow (720px/560px) for a focused product flow. The section widths will be **preserved** (not widened) since this is a product constraint.
4. **`body` overflow**: Source sets `body { overflow: hidden }` with only `<main>` scrolling (sidebar app shell). RoleBridge is a full-page scroll app — `overflow: hidden` on body will NOT be applied.

---

## Verification Plan

### After Implementation
1. Run dev server: `npm run dev` in `frontend/`
2. Visual check: Landing, Setup, Interview, End pages
3. Check: Logo box renders correctly in navbar
4. Check: Theme toggle works (dark/light) with correct token swap
5. Check: Buttons, inputs, cards, timer bar all use correct accent color
6. Check: Font families load correctly (Clash Display headings, Satoshi body, JetBrains Mono mono)
7. Push to GitHub for Vercel preview deployment
