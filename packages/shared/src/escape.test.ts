import test from "node:test";
import assert from "node:assert";
import { escapeHtml, escapeAttr, serializeForScript } from "./escape.js";

test("escapeHtml neutralizes element-breaking characters", () => {
  assert.strictEqual(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=\"alert(1)\"&gt;",
  );
  assert.strictEqual(escapeHtml("a & b"), "a &amp; b");
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
  assert.strictEqual(escapeHtml(42), "42");
});

test("escapeAttr neutralizes quote and angle-bracket breakouts", () => {
  assert.strictEqual(
    escapeAttr('" onmouseover="alert(1)'),
    "&quot; onmouseover=&quot;alert(1)",
  );
  assert.strictEqual(escapeAttr("a'b"), "a&#39;b");
  assert.strictEqual(escapeAttr("<>&"), "&lt;&gt;&amp;");
});

test("serializeForScript prevents </script> breakout", () => {
  const out = serializeForScript({ html: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("</script>"));
  assert.ok(out.includes("\\u003c"));
  // Round-trips back to the original value once parsed by the browser.
  assert.deepStrictEqual(JSON.parse(out), {
    html: "</script><script>alert(1)</script>",
  });
});

test("serializeForScript escapes JS line separators", () => {
  const ls = String.fromCharCode(0x2028);
  const ps = String.fromCharCode(0x2029);
  const out = serializeForScript({ text: `a${ls}b${ps}c` });
  assert.ok(out.includes("\\u2028"));
  assert.ok(out.includes("\\u2029"));
});
