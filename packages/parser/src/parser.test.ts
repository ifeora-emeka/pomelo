import test from "node:test";
import assert from "node:assert";
import { tokenize, parse } from "./index.js";

const sampleSFC = `
<Server lang="ts">
  const data = fetchProducts();
</Server>
<Client>
  let count = $local(0);
</Client>
<View>
  <div class="container" :class="themeClass">
    <h1 @click="increment">Hello View</h1>
    <input type="text" disabled />
    <img src="logo.png" />
    <Each of="products" as="product" key="product.id">
      <p>{{ product.name }}</p>
    </Each>
  </div>
</View>
<Style scoped>
  div { color: red; }
</Style>
`;

test("SFC lexer correctly tokenizes blocks", () => {
  const tokens = tokenize(sampleSFC);
  assert.strictEqual(tokens.length, 4);
  assert.strictEqual(tokens[0]?.type, "Server");
  assert.deepEqual(tokens[0]?.attributes, { lang: "ts" });
  assert.strictEqual(tokens[1]?.type, "Client");
  assert.deepEqual(tokens[1]?.attributes, undefined);
  assert.strictEqual(tokens[2]?.type, "View");
  assert.deepEqual(tokens[2]?.attributes, undefined);
  assert.strictEqual(tokens[3]?.type, "Style");
  assert.deepEqual(tokens[3]?.attributes, { scoped: "" });
});

test("SFC parser creates a root AST and parses top-level block attributes", () => {
  const ast = parse(sampleSFC);
  assert.strictEqual(ast.type, "Root");
  assert.strictEqual(ast.children.length, 4);

  const serverBlock = ast.children.find((c) => c.type === "Server");
  assert.ok(serverBlock);
  assert.deepEqual(serverBlock.attributes, { lang: "ts" });

  const styleBlock = ast.children.find((c) => c.type === "Style");
  assert.ok(styleBlock);
  assert.deepEqual(styleBlock.attributes, { scoped: "" });
});

test("SFC parser parses View block HTML structure, attributes, and directives", () => {
  const ast = parse(sampleSFC);
  const viewBlock = ast.children.find((c) => c.type === "View");
  assert.ok(viewBlock);
  assert.ok(viewBlock.children);
  assert.strictEqual(viewBlock.children.length, 1);

  const containerNode = viewBlock.children[0];
  assert.ok(containerNode);
  assert.strictEqual(containerNode.type, "Element");
  assert.strictEqual(containerNode.tagName, "div");
  assert.deepEqual(containerNode.attributes, {
    class: "container",
    ":class": "themeClass",
  });

  assert.ok(containerNode.children);
  assert.strictEqual(containerNode.children.length, 4);

  const h1Node = containerNode.children[0];
  assert.ok(h1Node);
  assert.strictEqual(h1Node.type, "Element");
  assert.strictEqual(h1Node.tagName, "h1");
  assert.deepEqual(h1Node.attributes, { "@click": "increment" });
  assert.ok(h1Node.children);
  assert.strictEqual(h1Node.children[0]?.type, "Text");
  assert.strictEqual(h1Node.children[0]?.content, "Hello View");

  const inputNode = containerNode.children[1];
  assert.ok(inputNode);
  assert.strictEqual(inputNode.tagName, "input");
  assert.deepEqual(inputNode.attributes, { type: "text", disabled: "" });

  const imgNode = containerNode.children[2];
  assert.ok(imgNode);
  assert.strictEqual(imgNode.tagName, "img");
  assert.deepEqual(imgNode.attributes, { src: "logo.png" });

  const eachNode = containerNode.children[3];
  assert.ok(eachNode);
  assert.strictEqual(eachNode.tagName, "Each");
  assert.deepEqual(eachNode.attributes, {
    of: "products",
    as: "product",
    key: "product.id",
  });
});

test("SFC parser validates multiple blocks of the same type", () => {
  const badSFC = `
<Server></Server>
<Server></Server>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Multiple <Server> blocks are not allowed/);
});

test("SFC parser validates unrecognized root blocks", () => {
  const badSFC = `
<Server></Server>
<Foo></Foo>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Invalid top-level block name "<Foo>"/);
});

test("SFC parser validates random text at root level", () => {
  const badSFC = `
random text here
<Server></Server>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Unexpected character "r" at root level/);
});

test("SFC parser validates unclosed top-level blocks", () => {
  const badSFC = `
<Server>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Missing closing tag <\/Server> for top-level block/);
});

test("SFC parser validates mismatched HTML tags in View block", () => {
  const badSFC = `
<View>
  <div></span>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Mismatched tag: expected <\/div> but found <\/span>/);
});

test("SFC parser validates unclosed HTML tags in View block", () => {
  const badSFC = `
<View>
  <div>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Unclosed tag <div> at the end of the template/);
});

test("SFC parser validates Each loop missing 'of' attribute", () => {
  const badSFC = `
<View>
  <Each as="product"></Each>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /<Each> loop is missing the required "of" attribute/);
});

test("SFC parser validates Each loop missing 'as' attribute", () => {
  const badSFC = `
<View>
  <Each of="products"></Each>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /<Each> loop is missing the required "as" attribute/);
});

test("SFC parser ignores HTML comments inside View block", () => {
  const sfc = `
<View>
  <!-- comment 1 -->
  <div>
    <!-- comment 2 -->
    <p>Hello</p>
  </div>
</View>
  `;
  const ast = parse(sfc);
  const viewBlock = ast.children.find((c) => c.type === "View");
  assert.ok(viewBlock);
  assert.ok(viewBlock.children);
  assert.strictEqual(viewBlock.children.length, 1);
  const divNode = viewBlock.children[0];
  assert.ok(divNode);
  assert.strictEqual(divNode.tagName, "div");
  assert.ok(divNode.children);
  assert.strictEqual(divNode.children.length, 1);
  assert.strictEqual(divNode.children[0]?.tagName, "p");
});

test("SFC parser validates unclosed HTML comment in View block", () => {
  const badSFC = `
<View>
  <div>
    <!-- unclosed
  </div>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Syntax Error: Unclosed HTML comment/);
});

test("SFC parser validates empty closing tag in View block", () => {
  const badSFC = `
<View>
  <div>Hello</>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Syntax Error: Invalid empty closing tag/);
});

test("SFC parser validates invalid tag name in View block", () => {
  const badSFC = `
<View>
  <div% class="foo">Hello</div>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Syntax Error: Invalid tag name/);
});

test("SFC parser validates unexpected closing tag in View block", () => {
  const badSFC = `
<View>
  </div>
</View>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Syntax Error: Unexpected closing tag <\/div> without opening tag/);
});

test("SFC parser validates self-closing top-level blocks", () => {
  const badSFC = `
<Server />
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Syntax Error: Top-level block <Server> cannot be self-closing/);
});

test("SFC parser validates top-level blocks with invalid characters in tag name", () => {
  const badSFC = `
<Server% lang="ts">
</Server>
  `;
  assert.throws(() => {
    parse(badSFC);
  }, /Syntax Error: Invalid top-level block name/);
});
