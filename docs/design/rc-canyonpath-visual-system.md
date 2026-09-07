# Reinisch Classroom CanyonPath Visual System

Status: **Phase 1A foundation — polish target**

This document defines the shared visual direction approved for the Reinisch Classroom platform. The system is intentionally opt-in during rollout so the existing Student Portal, Teacher Center, activities, and other production surfaces can be migrated one slice at a time without a platform-wide restyle.

## Design intent

The interface should feel calm, capable, and recognizably Reinisch Classroom. The visual language borrows the scenic depth and forward-motion feeling of CanyonPath while keeping instruction and work surfaces practical, readable, and low-glare.

The target is not "dark mode with pretty wallpaper." The target is a coherent product system with consistent hierarchy, surfaces, controls, iconography, depth, and interaction states. The higher-polish mockups are the quality bar: scenery should have layered depth, cards should feel intentionally composed, and small details should reinforce the system without becoming decoration noise.

## Adoption contract

Load the universal theme first, then the CanyonPath foundation. Pages that use the richer detail treatment also load the detail layer:

```html
<link rel="stylesheet" href="/assets/css/rc-theme.css" />
<link rel="stylesheet" href="/assets/css/rc-canyonpath.css" />
<link rel="stylesheet" href="/assets/css/rc-canyonpath-detail.css" />
<body class="rc-canyonpath rc-canyonpath--detailed">
```

`rc-canyonpath.css` and the optional detail layer are scoped to CanyonPath classes. Merely loading the stylesheets must not restyle an existing page. Pages opt in explicitly during their migration slice.

## Core rules

1. **No emoji UI icons. SVG is the default.** Functional controls and category/skill identity use a consistent inline SVG icon language. Compact text monograms such as `VT`, `CC`, or `SW` are fallback-only for legacy or unknown content, not the normal visual identity.
2. **Scenic art is atmosphere, never information.** The mountain/forest artwork may reinforce the brand but cannot carry instructional meaning or required text.
3. **Low glare is not low contrast.** Large white panels are avoided, but text contrast and focus visibility remain strong.
4. **One action hierarchy.** Mint indicates the primary forward action. Cream is reserved for finish/review or caution-adjacent actions. Quiet utilities stay dark and subdued.
5. **Glass is restrained but detailed.** Cards use translucent evergreen surfaces, fine borders, internal highlight lines, soft shadows, and subtle depth. Blur supports hierarchy; it is not decoration for its own sake.
6. **Micro-detail supports hierarchy.** Icon tiles, thin section rules, subdued glow, richer scenic layers, and restrained footer marks create polish without competing with instruction.
7. **Keyboard focus is obvious.** All interactive elements require a visible `:focus-visible` treatment.
8. **Reduced motion is honored.** The shared layer disables meaningful transitions when `prefers-reduced-motion` is enabled.
9. **Responsive behavior is part of the component.** Three-column layouts collapse deliberately; tables remain horizontally scrollable rather than crushing content.
10. **No broken or decorative media placeholders.** Scenic art is delivered through known local SVG/CSS assets; preview and production surfaces should never leave empty image, object, embed, picture, or iframe frames on screen.

## Shared palette roles

The source of truth is `site/assets/css/rc-canyonpath.css`, with polish additions in `site/assets/css/rc-canyonpath-detail.css`.

- `--rc-cp-bg` / `--rc-cp-bg-deep`: page shell and deep background
- `--rc-cp-panel` / `--rc-cp-panel-strong`: glass card surfaces
- `--rc-cp-sage` / `--rc-cp-sage-soft`: instructional surface family
- `--rc-cp-mint` / `--rc-cp-mint-strong`: primary action and active-state family
- `--rc-cp-cream`: finish/review emphasis
- `--rc-cp-ink`, `--rc-cp-ink-dim`, `--rc-cp-muted`: text hierarchy
- `--rc-cp-line`, `--rc-cp-line-strong`: surface boundaries
- semantic success, warning, danger, and info tokens remain distinct from the brand accents

## Shared component families

Phase 1A provides reusable classes for:

- scenic hero and footer framing
- cards and interactive cards
- richer detailed cards with internal highlights and depth
- primary, secondary, quiet, cream, danger, and icon buttons
- inline SVG icon containers and detailed icon tiles
- fallback skill monograms for legacy/unknown items only
- tabs and segmented navigation
- list rows and chevrons
- progress bars, progress rings, and status badges
- form inputs, selects, textareas, and scalable tables
- instructional callouts, answer choices, and feedback surfaces
- typography hierarchy, section rules, mottos, quotes, and grid utilities

## Scenic assets

`/assets/bg/rc-canyonpath-landscape.svg` is the base original vector landscape.

`/assets/bg/rc-canyonpath-landscape-rich.svg` is the higher-detail original vector used by the polished layer. It adds layered mountain facets, additional forest density, valley mist, foreground depth, and a more visible river/trail while remaining decorative and self-contained. Neither asset contains external resources or scripts.

## Reference preview

The Phase 1A component gallery is available at:

`/design-system/canyonpath/`

It uses synthetic data only and exists to review the shared design language before production surfaces adopt it. The gallery should represent the polished target, including SVG icon tiles, richer scenic treatment, and no stray media placeholder frames.

## Rollout sequence

### Phase 1A — Foundation

- shared tokens
- base and rich scenic assets
- reusable component classes
- detailed polish layer
- SVG-first icon treatment
- accessibility and responsive rules
- isolated visual reference page

### Phase 1B — Language Arts pilot

- retrofit the Language Arts Skill Builder to the shared layer
- bring the live dashboard, normal question screen, and Sentence Workshop closer to the approved mockups
- replace letter/emoji category identity with SVG icon tiles where appropriate
- preserve scoring, read-aloud, storage, navigation, and instructional behavior
- visual review before merge

### Phase 2 — Student surfaces

- Student Portal shell and dashboard
- My Progress / goal evidence / scalable assignment history
- shared activity surfaces where appropriate

### Phase 3 — Teacher surfaces

- Teacher Center shell
- Observation Center and daily triage surfaces
- reporting, student snapshots, and workflow cards

### Phase 4 — Platform completion

- Reinisch Classroom front door / main hub
- remaining activity families
- legacy cleanup after migrated surfaces are stable

## Non-goals for Phase 1A

Phase 1A does **not** change authentication, databases, RLS, student records, scoring, assignment state, activity logic, or production navigation. It establishes the visual primitives only.
