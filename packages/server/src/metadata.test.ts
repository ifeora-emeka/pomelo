import test from "node:test";
import assert from "node:assert";
import { mergeMetadata, renderMetadataHTML } from "./metadata.js";
import type { Metadata } from "@pomelo/types";

test("mergeMetadata merges flat SEO properties and overrides correctly", () => {
  const parent: Metadata = {
    title: "Parent Title",
    description: "Parent Desc",
    viewport: "width=device-width",
  };
  const child: Metadata = {
    title: "Child Title",
    canonical: "https://child.com",
  };

  const merged = mergeMetadata(parent, child);
  assert.strictEqual(merged.title, "Child Title");
  assert.strictEqual(merged.description, "Parent Desc");
  assert.strictEqual(merged.viewport, "width=device-width");
  assert.strictEqual(merged.canonical, "https://child.com");
});

test("mergeMetadata merges nested openGraph and twitter objects", () => {
  const parent: Metadata = {
    openGraph: {
      title: "Parent OG Title",
      type: "website",
    },
    twitter: {
      card: "summary",
      site: "@parent",
    },
  };
  const child: Metadata = {
    openGraph: {
      title: "Child OG Title",
      image: "https://child.com/image.png",
    },
    twitter: {
      creator: "@child",
    },
  };

  const merged = mergeMetadata(parent, child);
  assert.deepStrictEqual(merged.openGraph, {
    title: "Child OG Title",
    type: "website",
    image: "https://child.com/image.png",
  });
  assert.deepStrictEqual(merged.twitter, {
    card: "summary",
    site: "@parent",
    creator: "@child",
  });
});

test("mergeMetadata deduplicates meta and link arrays correctly", () => {
  const parent: Metadata = {
    meta: [
      { name: "theme-color", content: "blue" },
      { property: "og:locale", content: "en_US" },
    ],
    links: [
      { rel: "icon", href: "/favicon-parent.ico" },
      { rel: "stylesheet", href: "/parent.css" },
    ],
  };

  const child: Metadata = {
    meta: [
      { name: "theme-color", content: "red" },
      { name: "author", content: "Child" },
    ],
    links: [
      { rel: "icon", href: "/favicon-child.ico" },
      { rel: "stylesheet", href: "/child.css" },
    ],
  };

  const merged = mergeMetadata(parent, child);

  // Theme color should be overridden to red; locale and author should be preserved
  assert.deepStrictEqual(merged.meta, [
    { name: "theme-color", content: "red" },
    { property: "og:locale", content: "en_US" },
    { name: "author", content: "Child" },
  ]);

  // Icon should be overridden; stylesheets should both be preserved
  assert.deepStrictEqual(merged.links, [
    { rel: "icon", href: "/favicon-child.ico" },
    { rel: "stylesheet", href: "/parent.css" },
    { rel: "stylesheet", href: "/child.css" },
  ]);
});

test("renderMetadataHTML produces accurate HTML output", () => {
  const meta: Metadata = {
    charset: "utf-8",
    title: "SEO Title",
    description: "SEO Desc",
    canonical: "https://example.com",
    viewport: "width=device-width, initial-scale=1",
    openGraph: {
      title: "OG Title",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
    },
    meta: [{ name: "robots", content: "noindex" }],
    links: [
      { rel: "alternate", hreflang: "es", href: "https://example.com/es" },
    ],
  };

  const html = renderMetadataHTML(meta);
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes("<title>SEO Title</title>"));
  assert.ok(html.includes('<meta name="description" content="SEO Desc">'));
  assert.ok(html.includes('<link rel="canonical" href="https://example.com">'));
  assert.ok(
    html.includes(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ),
  );
  assert.ok(html.includes('<meta property="og:title" content="OG Title">'));
  assert.ok(html.includes('<meta property="og:type" content="article">'));
  assert.ok(
    html.includes('<meta name="twitter:card" content="summary_large_image">'),
  );
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(
    html.includes(
      '<link rel="alternate" hreflang="es" href="https://example.com/es">',
    ),
  );
});
