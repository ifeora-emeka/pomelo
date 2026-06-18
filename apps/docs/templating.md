---
title: Templating
description: The View block — interpolation, raw HTML, attribute and class bindings, events, and the Each/When/Show/Else/Slot tags.
category: Core Concepts
order: 2
---

# Templating

The `<View>` block is plain HTML with a few superpowers.

## Interpolation

Use `{{ }}` for **escaped** text and `{{{ }}}` for **raw, unescaped** HTML (for example, rendered markdown):

```html
<p>{{ title }}</p>
<article>{{{ renderedHtml }}}</article>
```

> Only use `{{{ }}}` with HTML you trust — it is not escaped.

## Attribute & class bindings

Prefix an attribute with `:` to bind an expression:

```html
<a :href="'/products/' + product.slug">{{ product.name }}</a>
<img :src="product.image" :alt="product.name" />
<button :disabled="!inStock">Add to cart</button>

<!-- conditional classes -->
<button :class="active ? 'bg-primary-600 text-white' : 'bg-bg-secondary'">
  Filter
</button>
```

## Events

Prefix with `@` to attach an event handler. The current event is available as `event`:

```html
<button @click="addToCart(product)">Add</button>
<input @input="onSearch(event)" />
```

## Template tags

| Tag | Purpose |
| --- | --- |
| `<Each of="items" as="item">` | Render a list |
| `<When condition="expr">` | Render when truthy |
| `<Else>` | Pair with `<When>`/`<Show>` |
| `<Show condition="expr">` | Toggle visibility |
| `<Slot />` | Render child/page content (layouts & components) |

```html
<When condition="items.length > 0">
  <ul>
    <Each of="items" as="item">
      <li>{{ item.label }}</li>
    </Each>
  </ul>
</When>
<Else>
  <p>Nothing here yet.</p>
</Else>
```
