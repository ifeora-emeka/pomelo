import type { Metadata } from "@pomelo/types";

export function mergeMetadata(parent: Metadata, child: Metadata): Metadata {
  const merged: Metadata = {
    ...parent,
    ...child,
    openGraph: {
      ...parent.openGraph,
      ...child.openGraph,
    },
    twitter: {
      ...parent.twitter,
      ...child.twitter,
    },
  };

  // Merge meta tags by deduplicating name/property
  const metaMap = new Map<string, any>();
  const addMetas = (metas?: any[]) => {
    if (!metas) return;
    for (const m of metas) {
      const key = m.name
        ? `name:${m.name}`
        : m.property
          ? `property:${m.property}`
          : JSON.stringify(m);
      metaMap.set(key, m);
    }
  };
  addMetas(parent.meta);
  addMetas(child.meta);
  merged.meta = Array.from(metaMap.values());

  // Merge link tags by deduplicating rel/href combinations
  const linkMap = new Map<string, any>();
  const addLinks = (links?: any[]) => {
    if (!links) return;
    for (const l of links) {
      const key =
        l.rel === "canonical" || l.rel === "icon"
          ? `rel:${l.rel}`
          : `rel:${l.rel}:href:${l.href}`;
      linkMap.set(key, l);
    }
  };
  addLinks(parent.links);
  addLinks(child.links);
  merged.links = Array.from(linkMap.values());

  return merged;
}

export function renderMetadataHTML(metadata: Metadata): string {
  let html = "";

  if (metadata.charset) {
    html += `<meta charset="${metadata.charset}">\n`;
  }
  if (metadata.viewport) {
    html += `<meta name="viewport" content="${metadata.viewport}">\n`;
  }
  if (metadata.title) {
    html += `<title>${metadata.title}</title>\n`;
  }
  if (metadata.description) {
    html += `<meta name="description" content="${metadata.description}">\n`;
  }
  if (metadata.canonical) {
    html += `<link rel="canonical" href="${metadata.canonical}">\n`;
  }
  if (metadata.robots) {
    html += `<meta name="robots" content="${metadata.robots}">\n`;
  }

  // OpenGraph
  if (metadata.openGraph) {
    const og = metadata.openGraph;
    if (og.title) html += `<meta property="og:title" content="${og.title}">\n`;
    if (og.description)
      html += `<meta property="og:description" content="${og.description}">\n`;
    if (og.type) html += `<meta property="og:type" content="${og.type}">\n`;
    if (og.url) html += `<meta property="og:url" content="${og.url}">\n`;
    if (og.image) html += `<meta property="og:image" content="${og.image}">\n`;
    if (og.siteName)
      html += `<meta property="og:site_name" content="${og.siteName}">\n`;
  }

  // Twitter
  if (metadata.twitter) {
    const tw = metadata.twitter;
    if (tw.card) html += `<meta name="twitter:card" content="${tw.card}">\n`;
    if (tw.site) html += `<meta name="twitter:site" content="${tw.site}">\n`;
    if (tw.creator)
      html += `<meta name="twitter:creator" content="${tw.creator}">\n`;
    if (tw.title) html += `<meta name="twitter:title" content="${tw.title}">\n`;
    if (tw.description)
      html += `<meta name="twitter:description" content="${tw.description}">\n`;
    if (tw.image) html += `<meta name="twitter:image" content="${tw.image}">\n`;
  }

  // Custom Metas
  if (metadata.meta) {
    for (const m of metadata.meta) {
      const nameAttr = m.name ? ` name="${m.name}"` : "";
      const propAttr = m.property ? ` property="${m.property}"` : "";
      html += `<meta${nameAttr}${propAttr} content="${m.content}">\n`;
    }
  }

  // Custom Links
  if (metadata.links) {
    for (const l of metadata.links) {
      const attrs = Object.entries(l)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      html += `<link ${attrs}>\n`;
    }
  }

  return html;
}
