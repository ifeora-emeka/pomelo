import { test } from "node:test";
import assert from "node:assert/strict";
import { scanRegions, blockContent } from "./regions.js";

test("splits a well-formed .kal into blocks", () => {
  const src = [
    '<Server lang="ts">const a = 1;</Server>',
    '<Client lang="ts">const b = 2;</Client>',
    "<View><h1>hi</h1></View>",
    "<Style scoped>.a{color:red}</Style>",
  ].join("\n");

  const regions = scanRegions(src);
  assert.deepEqual(
    regions.map((r) => r.name),
    ["Server", "Client", "View", "Style"],
  );
  assert.equal(blockContent(src, regions[0]!), "const a = 1;");
  assert.equal(regions[3]!.attributes, "scoped");
});

test("recovers an unterminated block without throwing", () => {
  const src = '<Server lang="ts">const a = 1;';
  const regions = scanRegions(src);
  assert.equal(regions.length, 1);
  assert.equal(regions[0]!.unterminated, true);
  assert.equal(regions[0]!.name, "Server");
});

test("captures duplicate blocks for diagnostics", () => {
  const src = "<View>a</View><View>b</View>";
  const regions = scanRegions(src);
  assert.equal(regions.length, 2);
  assert.ok(regions.every((r) => r.name === "View"));
});

test("ignores non-block tags at the top level", () => {
  const src = "<View><Server>not a block here</Server></View>";
  const regions = scanRegions(src);
  // The first <Server> inside <View> is matched only after </View> closes,
  // so the View region is returned intact.
  assert.equal(regions[0]!.name, "View");
});
