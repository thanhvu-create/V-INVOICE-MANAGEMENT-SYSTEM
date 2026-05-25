---
name: hung-phat-ui-design-v2
description: Create or improve UI for Hung Phat, a luxury jewelry brand, using Next.js and Tailwind CSS. Use this skill for any Hung Phat digital surface — website pages, landing pages, dashboards, internal tools, email templates, React components, or branded UI. Triggers include Hung Phat branding or design system, jewelry e-commerce UI, and any frontend work that must follow Hung Phat's visual identity (signature pink, beige foundation, editorial serif typography, Toile de Jouy pattern). Also use for styling or beautifying Hung Phat web UI, customer-facing booking flows, and on-brand internal tools. Also use for UI/UX fundamentals on Hung Phat surfaces — visual hierarchy, signifiers and affordances, button and input states, hover/focus/active/disabled states, micro-interactions, loading states, dark mode, shadows and depth, icon sizing, overlays, and feedback patterns.
---

# Hung Phat UI/UX Design Skill

## Goal

Design workflow-first, brand-faithful interfaces for Hung Phat using Next.js and Tailwind CSS. Every surface — marketing pages, product displays, booking flows, internal dashboards, and transactional screens — must share a single cohesive editorial aesthetic: restrained, typographic, warm, and deliberate. Visual interest comes from hierarchy, proportion, and whitespace, not decoration. The interface should feel composed, not reactive.

Hung Phat is a third-generation jewelry company with roots in Vietnam, specializing in customizable engagement rings and fine jewelry. The brand experience is concierge-level: champagne is poured, chocolate is served, and every interaction should feel like a personal consultation. The digital experience must honor that same warmth and refinement.

Use this skill for:

- Marketing and editorial pages (homepage, about, services, lookbooks)
- Product and collection displays
- Appointment booking and consultation flows
- Customer portals and order tracking
- Internal tools (inventory, CRM dashboards, order management)
- Email and notification templates
- Any React component or page that carries the Hung Phat brand

---

## Aesthetic System

Apply this design language consistently across every surface. Adapt the expression — a mobile booking flow is more compact than a desktop editorial page, an internal tool uses tighter spacing than a marketing layout — but the underlying character stays the same.

### Design Character

Editorial, luxury-minimal. The feel is a refined jewelry atelier's digital extension, not a generic e-commerce store. Restrained and typographic. Hierarchy comes from proportion and whitespace, not color or decoration. Nothing should feel "app-like" in the generic sense: no heavy rounded corners, no decorative shadows, no gradients, no emoji in UI chrome, no bright primary colors beyond the signature pink.

### Color Tokens

Define these as Tailwind CSS custom properties in your global stylesheet and extend in `tailwind.config.js`:

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-foundation: #F7F1EB;     /* page background, the beige anchor */
    --surface-card: #FBF7F1;      /* card and panel surfaces */
    --surface-inset: #EFE8DD;     /* table headers, callouts, loading states */
    --ink-primary: #2A2725;       /* headings, primary buttons, masthead */
    --ink-body: #4A4540;          /* body text, table cells */
    --ink-muted: #8A8178;         /* labels, captions, helper text */
    --rule: #D4CFC4;              /* hairline borders, dividers */
    --accent: #E91D79;            /* Hung Phat Pink — see accent rules */
    --platinum: #BDC1C6;          /* supporting neutral */
  }
}
```

```js
// tailwind.config.js (extend section)
module.exports = {
  theme: {
    extend: {
      colors: {
        'hp-foundation': 'var(--bg-foundation)',
        'hp-card': 'var(--surface-card)',
        'hp-inset': 'var(--surface-inset)',
        'hp-ink': 'var(--ink-primary)',
        'hp-body': 'var(--ink-body)',
        'hp-muted': 'var(--ink-muted)',
        'hp-rule': 'var(--rule)',
        'hp-pink': 'var(--accent)',
        'hp-platinum': 'var(--platinum)',
      },
      fontFamily: {
        title: ['"The Seasons"', 'Georgia', 'serif'],
        body: ['"Cardo"', 'Georgia', 'serif'],
      },
    },
  },
};
```

Beige (`--bg-foundation`) is the foundation color, present on every page as the background. Pink is the signature and must be used intentionally, not everywhere. Platinum and charcoal are supporting neutrals. Accent colors like soft blush or muted taupe may appear sparingly only if they support the overall palette.

### Accent Pink Rules

The accent pink (`#E91D79`, Hung Phat Pink) appears **at most three times per visible screen** and only in these roles:

1. **Active input focus ring** — every focused field shows a pink bottom border or ring. Functional, appears on interaction, disappears on blur.
2. **Primary action hover** — the single most important button on the screen (Book Appointment, Submit, Confirm) shifts to pink background on hover. Every other button — Cancel, secondary, repeated table actions — inverts to charcoal on hover instead.
3. **One structural accent** — either a thin top border on a sticky action bar, an inline error message, a single status indicator, or a decorative rule. Never more than one of these per screen.

Never use pink as a static button background, page-wide fill, header band, or repeating decoration. Destructive actions (Delete, Cancel Order) hover charcoal, not pink — pink reads as "move forward," not "destroy."

### Typography

- **Titles and headings**: The Seasons (serif) — weight 400. This is the brand's display typeface. Use for page titles, section headings, hero text, and any large editorial moment.
- **Body and UI text**: Cardo (serif) — the brand's body typeface. Use for paragraphs, form labels, buttons, navigation, and all running text.
- **Eyebrow labels**: uppercase, `tracking-[0.14em]`, `text-[10px]` or `text-[11px]`, color `hp-muted`.
- **Numeric data**: `tabular-nums` via Tailwind's `font-variant-numeric`.
- Hierarchy comes from size and spacing, not weight. Two weights only: 400 regular, 500 medium.

Load fonts in `app/layout.tsx` or via `next/font`:

```tsx
// Using next/font/google
import { Cardo } from 'next/font/google';

const cardo = Cardo({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-cardo',
});

// The Seasons is a commercial font — load via @font-face in globals.css
// or substitute with Cormorant Garamond as a fallback if unavailable:
import { Cormorant_Garamond } from 'next/font/google';

const titleFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-title',
});
```

If The Seasons is not available as a web font, use Cormorant Garamond as the closest open-source substitute. The feel should remain editorial-serif with high contrast and elegant proportions.

### Tuning Display Typography

A common piece of generic UI advice is to tighten letter spacing by -2% to -3% and drop line height to 110–120% on large headers — the "instant pro look" hack. This works for sans-serif headers because they ship with loose default tracking. For Hung Phat's display serif, the rules differ:

- **Letter spacing on display serif**: leave at 0 or apply *positive* tracking on very large headlines (`tracking-[0.01em]` to `tracking-[0.02em]`). The Seasons and Cormorant Garamond are already drawn with tight proportions; tightening further crowds the counters and ligatures and makes the type feel cramped instead of refined.
- **Letter spacing on small caps and eyebrow labels** (the only sans-serif-style treatment in the system): apply the wide tracking already specified — `tracking-[0.14em]` for uppercase labels. This is where loose tracking earns its keep.
- **Line height on display serif**: drop to `leading-tight` (1.25) or `leading-[1.15]` for the largest sizes (48px and up). Below 32px, use `leading-tight` to `leading-snug` (1.25 to 1.375). The general direction — tighter line height for larger text — is correct; the magnitude is just gentler for serif.
- **Line height on body serif** (Cardo at 16–18px): use `leading-relaxed` (1.625) or `leading-7` (1.75). Serif body copy needs more line height than sans because the serifs add visual weight to each line.
- **Optical sizing**: where the font supports it, enable `font-optical-sizing: auto` so display sizes render with their display-cut proportions and body sizes render with their text-cut proportions.

The shorthand: trust the serif. The aesthetic the video is teaching you to fake with tracking and line-height adjustments is what an editorial serif already delivers at default settings.

### Layout and Spacing

- 8px spacing scale: use Tailwind's `space-1` (4px), `space-2` (8px), `space-3` (12px), `space-4` (16px), `space-6` (24px), `space-8` (32px), `space-12` (48px)
- Hairline borders (`border border-hp-rule`) instead of shadows
- No `rounded-lg` or `rounded-xl` on cards, panels, or sections; inputs and buttons may use `rounded-sm` (2px) maximum
- No `shadow-*` for decoration
- Generous internal padding: `p-6` to `p-8` for cards, `p-7` to `p-9` for full-width panels
- Whitespace is the primary structural tool — when in doubt, add more breathing room, not more borders
- Max content width: `max-w-7xl` (1280px) centered with `mx-auto` and `px-6` or `px-8` gutters

---

## UI/UX Fundamentals

These principles are universal to good interface design, but they are expressed here through the Hung Phat lens. Every fundamental below is a tool to make the editorial aesthetic *work* as an interface — not just look beautiful. When the aesthetic and the fundamentals seem to conflict, the fundamental wins. A beautiful screen that the user can't operate has failed.

### Signifiers and Affordances

A signifier is a visual cue that tells the user what an element does or what state it's in. The interface should communicate through form, not through instructions.

- **Containers communicate grouping.** When elements share a `bg-hp-card` panel or sit inside the same hairline border, the user reads them as related. When a single item gets its own container while peers don't, it reads as selected, featured, or distinct.
- **Inactive elements look inactive.** Use `text-hp-muted` and remove the focus/hover affordance. Never disable an element while leaving its color fully saturated — the user will keep clicking.
- **Every interactive element needs a visible affordance.** Hover states, focus rings, and pressed states are not decoration; they are how the user knows something will respond. Links underline on hover, buttons shift to charcoal or pink on hover, inputs show a pink bottom border on focus. If a user has to ask "is this clickable?", the design has failed.
- **The hover signifier should match the action's weight.** Primary action hovers pink (the brand's "forward" signal). Secondary actions invert to charcoal. Destructive actions invert to charcoal — never pink, because pink in this system reads as "proceed."
- **Don't add instructional copy to compensate for missing signifiers.** "Click here to continue" is a sign that the button itself isn't doing its job. Fix the button.

### Visual Hierarchy

Hierarchy is created by **contrast** — the difference between large and small, ink and muted, dense and airy. The Hung Phat aesthetic deliberately limits the tools available (no bright colors, no heavy weights, no decorative shadows), which means size, position, and whitespace must do almost all the work.

The hierarchy toolkit, in order of how often you'll reach for it:

1. **Size** — `font-title` at 28–48px for the most important moment on a screen; `font-body` at 16px for running text; `text-[11px]` uppercase tracked for labels and metadata. The gap between hero and body should be dramatic, not gradual.
2. **Position** — the most important element goes near the top of its container. Price, primary action, and key dates sit where the eye lands first.
3. **Color contrast** — `text-hp-ink` for the things that matter, `text-hp-body` for supporting prose, `text-hp-muted` for metadata and labels. Pink is reserved (see Accent Pink Rules) and is not a hierarchy tool — it is a signifier.
4. **Whitespace** — generous space *around* an element makes it more important than a denser cluster nearby. This is the primary hierarchy tool in editorial layouts.

A common failure mode is a "spreadsheet card" — all elements at the same size, weight, and color, technically organized but visually flat. The fix is almost never adding color or weight; it's increasing the size and whitespace gap between primary and secondary elements.

For landing pages: up to six font sizes is reasonable. For internal dashboards: rarely exceed 24px for the largest text, and use 3–4 sizes total. Dense data surfaces need tighter hierarchy because the user is scanning, not reading.

### Whitespace and Grouping

Whitespace is the structural tool. The 8px scale (Tailwind's `space-*`) creates rhythm because every value is a multiple — you can always halve or double a gap and it stays consistent.

- **Default gap between unrelated elements**: `space-y-8` (32px). This is the rhythm of an editorial page.
- **Group related elements with smaller gaps**: a label and its input sit `mb-2` apart; an input and its helper text sit `mt-1.5` apart. The user reads tighter spacing as "these belong together."
- **Internal padding on cards and panels**: `p-6` to `p-8` for cards, `p-7` to `p-9` for full-width panels. Internal tools may use `p-4` to `p-6` for tighter density, but never less.
- **Grids are guidelines, not laws.** A 12-column grid is useful for responsive behavior on repeating content (galleries, product grids, blog indexes). Custom landing pages and editorial hero sections rarely need to align rigidly to any grid — composition matters more.

When a layout feels cramped, the answer is almost always more whitespace, not more borders or smaller text.

### Icon Sizing

Icons are usually too large by default. The rule: **match the icon size to the line height of the adjacent text.**

- Body text at 16px with a 24px line height → icons at 24px (`w-6 h-6`)
- Eyebrow labels at 11px with a 16px line height → icons at 16px (`w-4 h-4`)
- Tighten the text-to-icon gap to `gap-2` (8px) so the pair reads as one unit, not two

Use icons sparingly. Hung Phat is a typographic brand — icons support the text, they don't replace it. Outline icons (Lucide, Heroicons outline) feel right; filled and bright icons feel wrong.

### Interactive States

Every interactive element needs explicit states. The aesthetic is restrained, so the state changes must be visible without being loud.

**Buttons** require at minimum:

- **Default** — the resting state defined in Component Patterns
- **Hover** — color shift (primary → pink, secondary → inverted charcoal); never scale or shadow
- **Active/Pressed** — slightly darker than hover, no shadow, no animation
- **Disabled** — `opacity-40`, `cursor-not-allowed`, no hover response
- **Loading** — uppercase tracked label changes ("BOOK YOUR CONSULTATION" → "CONFIRMING"), button stays disabled until response. No spinner inside the button — the label change is the feedback.

**Inputs** require at minimum:

- **Default** — bottom border `border-hp-rule`
- **Focus** — bottom border thickens to 2px and shifts to `border-hp-pink`
- **Filled** — same as default; the value's presence is the signifier
- **Error** — bottom border in `border-hp-pink`, error message below in `text-hp-pink text-xs`
- **Warning** — bottom border in `border-hp-platinum`, warning message in `text-hp-muted text-xs` (for optional concerns, not blocking errors)
- **Disabled** — `opacity-40`, transparent border, no focus response

If an element changes state but the user can't see it, the state doesn't exist. Test every state by tabbing through the form without using a mouse.

### Feedback and Micro-Interactions

A core principle: **when the user does anything, there must be a response.** The response can be quiet, but it cannot be absent.

- A clicked button must visibly acknowledge the click before the action completes (state change, label change, or both)
- A submitted form must show progress (button label change, inline status text) and result (inline confirmation or redirect)
- A copied value must confirm the copy — a button that just sits there after a click leaves the user unsure
- A saved field must confirm the save — even an inline "Saved" in `text-hp-muted` that fades after 3 seconds

Micro-interactions extend basic feedback into something the user can trust. The classic example: a "Copy" button changes its hover state on click, but the user still doesn't know if anything was copied. The fix is a small inline confirmation — for Hung Phat, this is an uppercase tracked "COPIED" in `text-hp-muted` that fades in below the button and dismisses after 2 seconds. Quiet, but unambiguous.

Hung Phat's micro-interactions stay on the practical end of the spectrum, never the playful end. No bounces, no confetti, no celebratory animations. The interaction confirms the action and disappears. (See also the Motion section.)

### Depth: Borders, Backgrounds, and Shadows

The Hung Phat aesthetic uses hairline borders and surface elevation (lighter backgrounds against the beige foundation) instead of shadows for depth. This is a deliberate stylistic choice — shadows feel "app-like" and add visual weight that competes with typography.

When a shadow is unavoidable (popovers, dropdowns, modal dialogs that sit above content):

- Keep the shadow subtle: low opacity (8–12%), large blur (24–48px), small offset (0–4px)
- The shadow should be felt, not seen. If a user notices the shadow before the content, it's too strong.
- Cards and panels never get shadows — they earn separation through hairlines and surface tint instead.
- Popovers and dropdowns may use a soft shadow because they float above content with no other separation cue.

For depth without shadow, use the surface hierarchy already in the token system: `hp-foundation` (page) → `hp-card` (resting surface) → `hp-inset` (recessed: table headers, callouts) → `hp-card` over `hp-inset` (raised: a card sitting on a callout block).

### Dark Mode

Hung Phat's primary aesthetic is light — the beige foundation is core to the brand. Dark mode is **not a default** for marketing or customer-facing surfaces. Reserve dark mode for:

- Internal tools where reps explicitly prefer it (long sessions, low-light environments)
- Optional theme toggle for the customer portal
- Specific editorial moments (a single hero section with a dark background, used intentionally)

When implementing dark mode, the rules invert in specific ways:

- **No shadows.** Dark backgrounds can't show shadow depth. Instead, use a *lighter* card surface to indicate elevation — the opposite of light mode.
- **Lower the saturation on the accent.** Pure `#E91D79` against a dark background is jarring. Dim brightness and saturation by ~15% for dark-mode pink, or use it only in small accents (focus rings, single status dots).
- **Soften borders.** Hairlines at full strength create too much contrast against dark surfaces; reduce opacity or use a darker rule color.
- **Flip text contrast.** Foundation becomes ink, ink becomes foundation. Maintain the same hierarchy ratio between ink/body/muted — just inverted.
- **Dark mode is not "black."** Use a warm dark (`#1A1815` or similar) that echoes the warmth of the beige, not pure black. The brand is warm in both modes.

Define dark-mode tokens as a `.dark` variant of the same custom properties — never hardcode dark colors in components.

### Overlays and Image Treatments

When text must sit over an image, the image needs treatment to keep text readable without ruining the image. The Hung Phat preference, in order:

1. **Linear gradient overlay** — a vertical gradient from transparent at the top to `rgba(42, 39, 37, 0.7)` (charcoal) at the bottom, with text in `text-hp-foundation` over the dark zone. This preserves the upper portion of the image and provides a clean reading surface below.
2. **Progressive blur** — for hero sections that warrant extra refinement, layer a subtle backdrop-blur over the gradient. This is an editorial touch, used sparingly.
3. **Full-screen flat overlay** — only as a last resort when the image content is too busy for a gradient. The flat overlay should be `bg-hp-ink/40` to `bg-hp-ink/60`, never higher.

Never place text directly on an untreated image — even on imagery that looks light, the contrast will fail somewhere. Test text-over-image at 200% zoom and on mobile, where the image crops differently.

```tsx
<div className="relative h-[480px] overflow-hidden">
  <Image src={hero} alt="" fill className="object-cover" />
  <div className="absolute inset-0 bg-gradient-to-t from-hp-ink/70 via-hp-ink/20 to-transparent" />
  <div className="absolute bottom-0 left-0 right-0 p-8 text-hp-foundation">
    <h1 className="font-title text-4xl">{title}</h1>
    <p className="mt-3 font-body text-base opacity-90">{subtitle}</p>
  </div>
</div>
```

---

## Component Patterns

### Section Header

Use at the top of each logical group on any page:

```tsx
<div className="mb-8">
  <span className="block uppercase tracking-[0.14em] text-[11px] text-hp-muted mb-2">
    {eyebrowLabel}
  </span>
  <h2 className="font-title text-[28px] text-hp-ink leading-tight">
    {title}
  </h2>
  <div className="mt-4 h-px bg-hp-rule" />
</div>
```

### Form Inputs

Bottom-border only, no box. Transparent background against the beige foundation:

```tsx
<div className="mb-6">
  <label className="block uppercase tracking-[0.14em] text-[11px] text-hp-muted mb-2">
    {label}
  </label>
  <input
    className="w-full bg-transparent border-0 border-b border-hp-rule px-0.5 py-1.5
               text-hp-body font-body text-base
               focus:outline-none focus:border-b-2 focus:border-hp-pink focus:pb-[5px]
               transition-colors duration-150"
  />
  {helperText && (
    <p className="mt-1.5 text-xs text-hp-muted">{helperText}</p>
  )}
  {error && (
    <p className="mt-1.5 text-xs text-hp-pink">{error}</p>
  )}
</div>
```

Labels sit above in eyebrow style. Helper text below in muted; errors in pink.

### Buttons

**Primary** (one per screen):

```tsx
<button className="bg-hp-ink text-hp-foundation uppercase tracking-[0.14em] text-xs
                   px-[22px] py-[14px] rounded-sm
                   hover:bg-hp-pink transition-colors duration-150">
  {label}
</button>
```

**Secondary**:

```tsx
<button className="bg-transparent border border-hp-ink text-hp-ink uppercase tracking-[0.14em] text-xs
                   px-[22px] py-[14px] rounded-sm
                   hover:bg-hp-ink hover:text-hp-foundation transition-colors duration-150">
  {label}
</button>
```

**Destructive**: same shape as secondary, but text/border in `text-hp-pink border-hp-pink`. Hover: charcoal background, white text. Pink hover is never used for destructive actions.

No bright blue, green, or pill shapes anywhere.

### Tables

```tsx
<table className="w-full border-collapse">
  <thead>
    <tr className="bg-hp-inset">
      <th className="text-left uppercase tracking-[0.14em] text-[11px] text-hp-muted
                     py-3 px-4 border-b border-hp-rule">
        Column
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="bg-hp-card hover:bg-hp-inset transition-colors duration-150
                   border-b border-hp-rule">
      <td className="py-3 px-4 text-hp-body font-body tabular-nums">
        Data
      </td>
    </tr>
  </tbody>
</table>
```

Horizontal hairlines only, no vertical borders. Header row uses inset background with uppercase tracked muted labels. Hover shifts row background, no other effect.

### Loading / Status / Empty States

- **Loading**: `bg-hp-inset` block with uppercase "LOADING" label in `text-hp-muted`. No spinners. No skeleton shimmer. The editorial UI feels slow on purpose.
- **Errors**: `text-hp-pink` inline near the relevant field or action.
- **Empty**: Title in `font-title text-lg text-hp-ink`, muted body explanation underneath.
- **Success**: quiet — muted taupe inline status, auto-dismiss after 3 seconds if ephemeral. No green checkmarks, no celebratory color.

### Navigation

- Desktop: horizontal nav with `font-body` links in `text-hp-body`, uppercase `text-[11px] tracking-[0.14em]`. Active link underlined with a 2px pink bottom border.
- Mobile: slide-out drawer with the same typography. Beige background, full-height.
- Logo: "HUNG PHAT" wordmark in `font-title text-hp-pink` on marketing pages. HP monogram where space is small or a symbol feels more elegant.

### Cards (Product / Collection)

```tsx
<div className="bg-hp-card border border-hp-rule p-0 overflow-hidden">
  <div className="aspect-[4/5] relative">
    <Image src={image} alt={alt} fill className="object-cover" />
  </div>
  <div className="p-6">
    <span className="block uppercase tracking-[0.14em] text-[11px] text-hp-muted mb-1">
      {category}
    </span>
    <h3 className="font-title text-xl text-hp-ink">{name}</h3>
    <p className="mt-2 text-sm text-hp-body">{description}</p>
  </div>
</div>
```

No border-radius. No shadow. The image does the emotional work; the typography does the structural work.

---

## Motion

Editorial UIs feel slow on purpose. Transitions are deliberate, never reactive.

- `duration-150` with `ease-out` — applied via Tailwind's `transition-colors` or `transition-opacity`
- Animate `background-color`, `border-color`, `color`, `opacity` only
- Never animate layout, size, position, or transform
- No bouncing, no slide-ins, no entrance animations on page load
- Page transitions in Next.js should use simple opacity fades if any, never slide or scale

The interface should feel composed, not eager.

---

## UX Principles

The aesthetic creates an expectation that the UX must honor: deliberate, calm, trusting. A beautiful interface that feels janky breaks the contract.

### Information Density

Editorial design earns trust through whitespace, not density.

- A multi-field booking form should be divided into clear sections with visible breathing room, not a wall of inputs
- Mobile layouts should show fewer fields per screen — let the user scroll
- Use section headers to chunk related fields; never present many unlabeled fields in a row
- If a layout feels cramped, increase whitespace before tightening spacing

### Defaults and Prefill

Luxury-minimal UX implies the system has done thinking on the user's behalf. Empty forms feel cheap.

- Prefill today's date, the customer's last-used preferences, the current user's name
- Suggest derived values where possible (ring size from profile, preferred metal from history)
- Server-side defaults should arrive in the initial render via Next.js server components, not a second client-side fetch
- Never make the user type something the system already knows

### State Feedback

State changes are quiet and local, never global or blocking.

- Inline status text near the action that triggered it — not modal spinners or full-screen overlays
- Disable the submit button during requests; restore on failure
- Errors appear next to the relevant field or just above the action bar — never as toasts or browser alerts
- Success states redirect to the next step when there is nothing to inspect; show a short inline confirmation when the user stays on screen

### Error Recovery

When something fails, the user's work is sacred.

- Preserve every entered value on error — never reset the form
- Show the error inline; keep the view intact
- Re-enable the primary action so the user can retry without reloading
- Server errors should return structured responses so the client can display them cleanly

### Confirmation and Destructive Flows

Modal dialogs and red alerts break the aesthetic. Handle destructive actions inline.

- The destructive button changes its label on first click: "Cancel" → "Confirm cancel?"
- Second click within ~4 seconds executes; otherwise it reverts
- The confirm-state label can use `text-hp-pink`
- Use a modal overlay only when the action is irreversible and high-stakes (deleting a customer record, voiding an order)

### Keyboard and Accessibility

- Forms submit on Enter from any single-line text field
- Escape closes modals and drawers
- After form load, focus the first empty required field
- Tab order follows visual order, top to bottom, left to right
- All interactive elements must have visible focus states (pink underline or ring)
- Maintain WCAG AA contrast ratios — test pink text against beige backgrounds carefully; use pink only on white or dark backgrounds where contrast is sufficient

---

## Surface-Specific Guidance

### Marketing / Editorial Pages

- Full `bg-hp-foundation` page background
- Hero sections: large `font-title` headlines, generous whitespace, editorial imagery (soft, romantic, light, luminous — never dark or harsh)
- Content in `bg-hp-card` panels with `border border-hp-rule`, no shadow
- Optional masthead: full-width `bg-hp-ink` band, wordmark in `text-hp-foundation font-title`, `h-16`
- Max-width `max-w-7xl` centered, `px-8` gutters
- Imagery style: editorial with a soft, romantic tone capturing quiet luxury. Keep visuals clean and intentional, feminine, playful, refined. Avoid overly dark imagery and harsh shadows.

### Booking / Consultation Flows

- Single scrolling page with section headers preferred over a multi-step wizard
- Hairline-divided sections let users scan ahead and edit earlier values
- Only use a true multi-step flow when each step depends on server validation
- Calendar/time picker: minimal chrome, `bg-hp-card`, selected date in `bg-hp-ink text-hp-foundation`, today outlined in `border-hp-pink`
- Confirmation screen: serif title, order summary in a quiet card, single primary CTA

### Product / Collection Pages

- Grid layout: 2 columns on mobile, 3–4 on desktop
- Product cards: no rounded corners, no shadow, image-led with minimal text below
- Product detail: large hero image, details panel beside it on desktop, stacked on mobile
- Price displayed in `font-body tabular-nums text-hp-ink` — never in pink
- "Book Consultation" as the single primary action

### Internal Tools / Dashboards

- Same design tokens — internal tools should feel like the same brand, just more utilitarian
- Tighter spacing: `p-4` to `p-6` on cards
- Data tables follow the same hairline/inset header pattern
- Forms follow the same bottom-border input pattern
- Status indicators: use `text-hp-muted` for inactive, `text-hp-ink` for active, `text-hp-pink` for urgent (sparingly)

### Email Templates

- Inline CSS required (email clients strip `<style>` tags in many cases)
- Background: `#F7F1EB`
- Card panel: `#FBF7F1` with `1px solid #D4CFC4` border
- Headings: fall back to Georgia serif since custom fonts are unreliable in email
- Pink used only in the CTA button and one accent element
- Keep layout single-column, max-width 600px

---

## The Toile de Jouy Pattern

Hung Phat's signature pattern is a custom Toile de Jouy design featuring meaningful motifs: the family beneath a tree with Vietnamese zodiac animals, a ship symbolizing the founder's journey from Vietnam to California, Ben Thanh Market, the Golden Gate Bridge, family ring designs, and floral elements from both Vietnam and California.

Usage in digital surfaces:

- **Background texture**: use at low opacity (`opacity-5` to `opacity-10`) as a subtle page background on hero sections or special landing pages — never as a dominant fill
- **Packaging and print references**: when showing product packaging in the UI, the pattern should be visible on bags and boxes
- **Social media templates**: the pattern can frame content but should remain secondary to photography
- **Never tile it densely on screen** — it is a quiet signature, not wallpaper

If you have the pattern as an SVG or image asset, reference it as:

```tsx
<div
  className="absolute inset-0 opacity-[0.06] pointer-events-none"
  style={{ backgroundImage: 'url(/assets/hp-toile-pattern.svg)', backgroundSize: '800px' }}
/>
```

---

## Brand Voice in UI Copy

All microcopy, labels, and interface text should reflect the Hung Phat voice:

- **Warm and professional** by default
- **Concierge-level**: "We'll take care of this for you" not "Submit form"
- **Confident and expert**: state things with quiet authority, never hedging
- **Never salesy or pushy**: the interface invites, it does not demand
- Customers should feel: cared for, guided, pampered, understood, valued, and impressed

Examples:

- Button: "Book Your Consultation" not "Schedule Now"
- Empty state: "Your collection is waiting to begin" not "No items found"
- Error: "We couldn't save your preferences — please try again" not "Error 500"
- Success: "Your appointment is confirmed" not "Success!"
- Loading: "PREPARING YOUR EXPERIENCE" not "Loading..."

---

## Next.js Implementation Notes

### Project Structure

```
app/
├── layout.tsx          — Root layout with fonts, global styles, nav
├── page.tsx            — Homepage
├── globals.css         — Tailwind directives + CSS custom properties
├── (marketing)/        — Public marketing pages (route group)
│   ├── about/
│   ├── collections/
│   └── book/
├── (portal)/           — Authenticated customer portal (route group)
│   ├── orders/
│   └── profile/
└── (admin)/            — Internal dashboard (route group)
    ├── inventory/
    └── customers/

components/
├── ui/                 — Shared primitives (Button, Input, Card, SectionHeader)
├── marketing/          — Marketing-specific compositions
├── portal/             — Portal-specific compositions
└── admin/              — Admin-specific compositions
```

### Server Components First

Default to React Server Components. Use `'use client'` only when the component needs:

- Event handlers (onClick, onChange)
- Browser APIs (IntersectionObserver, localStorage)
- React hooks (useState, useEffect)

Marketing and editorial pages should be almost entirely server-rendered. Booking flows and interactive dashboards will have client components for forms and real-time state.

### Image Handling

Use `next/image` for all imagery. Hung Phat's imagery style is soft, romantic, light, and luminous — optimize accordingly:

```tsx
<Image
  src={src}
  alt={alt}
  fill
  className="object-cover"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  quality={85}
/>
```

### Metadata

Every page should include Hung Phat-branded metadata:

```tsx
export const metadata = {
  title: 'Page Title — Hung Phat',
  description: 'Your Jeweler For Life',
};
```

---

## Output Expectations

When creating or modifying a Hung Phat interface, provide:

- Next.js page or component files with proper TypeScript types
- Tailwind classes using the extended brand tokens (`hp-*` prefixed colors, `font-title`, `font-body`)
- Responsive behavior: mobile-first, breakpoints at `sm`, `md`, `lg`, `xl`
- Accessible markup: semantic HTML, proper heading hierarchy, focus management
- A brief note on the surface type chosen and why it fits the use case
- A brief note on any deviations from the brand system and why they were necessary (technical constraints, accessibility requirements, etc.)

Do not add generic documentation, unrelated UI abstractions, or component library boilerplate. Keep changes aligned with the existing project structure. Every output should feel like it belongs in the Hung Phat digital atelier.
