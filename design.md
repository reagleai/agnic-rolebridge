# RoleBridge Design System (Inferred)

## Color Palette

**Surfaces (Dark Mode / Default)**
- `bg`: `#0B1215` (Main background)
- `surface`: `#111D1A` (Cards, modals)
- `surface-2`: `#162520` (Hover states, secondary surfaces)
- `surface-dynamic`: `#1e3329` (Active/focused surfaces)
- `divider` / `border`: `rgba(62, 204, 144, 0.15)`

**Surfaces (Light Mode)**
- `bg`: `#F8FAFC`
- `surface`: `#FFFFFF`
- `surface-2`: `#F1F5F9`
- `surface-dynamic`: `#E2E8F0`
- `divider` / `border`: `#E2E8F0`

**Text (Dark Mode)**
- `text`: `#E8ECE9` (Primary text)
- `text-muted`: `#6B8078` (Secondary text, descriptions)
- `text-faint`: `#4a5e55` (Tertiary text, placeholders)
- `text-inverse`: `#0B1215` (Text on primary buttons)

**Text (Light Mode)**
- `text`: `#334155`
- `text-muted`: `#64748B`
- `text-faint`: `#94A3B8`
- `text-inverse`: `#F8FAFC`

**Accents (Both Modes)**
- `primary`: `#3ECC90` (Dark) / `#22C55E` (Light)
- `primary-hover`: `#5EDDA8` (Dark) / `#16A34A` (Light)
- `primary-active`: `#2dad7a` (Dark) / `#15803D` (Light)

## Typography

**Font Families**
- `heading`: `'Inter', sans-serif`
- `body`: `'Inter', sans-serif`
- `mono`: `'Inter Mono', 'Fira Code', 'Cascadia Code', monospace`

**Scale**
- `xs`: `0.813rem`
- `sm`: `0.938rem`
- `base`: `1rem`
- `lg`: `clamp(1.25rem, 2.5vw, 1.5rem)`
- `xl`: `clamp(2rem, 4vw, 3rem)`

## Spacing (4px Base)
- `1`: `0.25rem` (4px)
- `2`: `0.5rem` (8px)
- `3`: `0.75rem` (12px)
- `4`: `1rem` (16px)
- `5`: `1.25rem` (20px)
- `6`: `1.5rem` (24px)
- `8`: `2rem` (32px)
- `10`: `2.5rem` (40px)
- `12`: `3rem` (48px)
- `16`: `4rem` (64px)

## Radii
- `sm`: `8px`
- `md`: `8px`
- `lg`: `16px`
- `xl`: `16px`
- `full`: `999px`

## Interactive States
- **Hover**: Subtle background lightening, scale up (for icon buttons `scale(1.08)` or translate Y `-1px` or `-2px` for primary buttons), shadow application.
- **Focus**: Transparent border outline or ring, visually distinct.
- **Transitions**:
  - `fast`: `0.2s ease`
  - `interactive`: `0.3s ease`
  - `slow`: `0.5s ease`

## Components
- **Buttons**: Rounded (`var(--radius-full)` for pill style, `var(--radius-md)` for standard). Need clear hover/active states.
- **Modals/Cards**: Surface background with `1px` border of `var(--color-border)` and `border-radius: var(--radius-lg)`. Content should be well-padded (typically `var(--space-6)` or `var(--space-8)`).
- **Inputs**: Consistent borders, focus rings using `var(--color-primary)`, clear placeholder text (`var(--color-text-faint)`).
