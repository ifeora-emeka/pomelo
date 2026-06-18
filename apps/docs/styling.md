---
title: Styling with Tailwind
description: Kallo apps use Tailwind CSS v4 via src/styles/global.css, plus scoped <Style> blocks per component.
category: Styling & Assets
order: 1
---

# Styling with Tailwind

New Kallo apps come wired for **Tailwind CSS v4**. The entry file is `src/styles/global.css`, compiled to `public/tailwind.css` automatically during `dev` and `build`.

## Theme tokens

Tailwind v4 is configured in CSS with `@theme`. Define your color ramps and design tokens there:

```css
@import "tailwindcss";

@source "../**/*.kal";

/* Class-based dark mode for a runtime theme toggle */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-primary-50: #fff7ed;
  --color-primary-500: #fd8d35;
  --color-primary-950: #431407;
  /* …full 50–950 ramp… */
}
```

Use the tokens as normal Tailwind utilities: `bg-primary-600`, `text-primary-50`, `border-primary-200`.

## Per-component styles

A component can ship scoped CSS in a `<Style>` block:

```html
<View>
  <div class="callout">Heads up!</div>
</View>

<Style>
  .callout { border-left: 3px solid var(--color-primary-500); }
</Style>
```

## Dark mode

Toggle the `dark` class on `<html>` and your `@custom-variant dark` utilities respond. A common pattern is a `$store` that flips the class and persists the choice to `localStorage`.
