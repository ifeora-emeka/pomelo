import test from "node:test";
import assert from "node:assert";
import { handleSSRWithLayouts } from "./server.js";

test("handleSSRWithLayouts nests layouts from outermost to innermost", async () => {
  const rootLayout = {
    render(state: any, slots: any) {
      const content = slots && slots.default ? slots.default() : "";
      return `<div id="root">${content}</div>`;
    },
    css: "#root { background: black; }",
  };

  const blogLayout = {
    render(state: any, slots: any) {
      const content = slots && slots.default ? slots.default() : "";
      return `<section id="blog">${content}</section>`;
    },
    css: "#blog { color: white; }",
  };

  const postPage = {
    render(state: any) {
      return `<h1>My Post</h1>`;
    },
    css: "h1 { margin: 0; }",
  };

  const req = {
    params: {},
    query: {},
    path: "/blog/post-1",
    route: { path: "/blog/:id" },
  } as any;
  let statusVal = 0;
  let bodyHTML = "";

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    send(html: string) {
      bodyHTML = html;
      return this;
    },
    headersSent: false,
  } as any;

  await handleSSRWithLayouts(req, res, postPage, [rootLayout, blogLayout]);

  assert.strictEqual(statusVal, 200);
  assert.ok(
    bodyHTML.includes(
      '<div id="root"><section id="blog"><h1>My Post</h1></section></div>',
    ),
  );
  assert.ok(bodyHTML.includes("h1 { margin: 0; }"));
  assert.ok(bodyHTML.includes("#root { background: black; }"));
  assert.ok(bodyHTML.includes("#blog { color: white; }"));
});

test("handleSSRWithLayouts runs layout $serverPage hooks and combines states", async () => {
  const rootLayout = {
    async $serverPage() {
      return { rootTitle: "Root title" };
    },
    render(state: any, slots: any) {
      const content = slots && slots.default ? slots.default() : "";
      return `<title>${state.rootTitle}</title>${content}`;
    },
  };

  const postPage = {
    render(state: any) {
      return `<p>Page Content</p>`;
    },
  };

  const req = { params: {}, query: {}, path: "/", route: { path: "/" } } as any;
  let bodyHTML = "";

  const res = {
    status() {
      return this;
    },
    send(html: string) {
      bodyHTML = html;
      return this;
    },
    headersSent: false,
  } as any;

  await handleSSRWithLayouts(req, res, postPage, [rootLayout]);

  assert.ok(bodyHTML.includes("<title>Root title</title><p>Page Content</p>"));
});
