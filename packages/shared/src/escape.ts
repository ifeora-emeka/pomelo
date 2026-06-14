const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

const ATTR_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>]/g, (c) => HTML_ESCAPES[c]!);
}

export function escapeAttr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => ATTR_ESCAPES[c]!);
}

// Matches characters that can break out of an inline <script> when embedding
// JSON: <, >, & and the JS line terminators U+2028 / U+2029.
const SCRIPT_UNSAFE = new RegExp("[<>&\\u2028\\u2029]", "g");

export function serializeForScript(value: unknown): string {
  return JSON.stringify(value ?? null).replace(SCRIPT_UNSAFE, (c) => {
    const code = c.charCodeAt(0).toString(16).padStart(4, "0");
    return "\\u" + code;
  });
}
