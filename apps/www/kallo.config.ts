import { defineConfig } from "@kallojs/server";

// The docs site ships as a fully static export (`kallo export`) and is hosted
// on GitHub Pages. It serves from the custom domain kallo.idegin.com, so
// basePath stays empty and a CNAME is emitted from public/. Switch to
// `basePath: "/kallo"` if you drop the custom domain and serve the project page
// at ifeora-emeka.github.io/kallo instead.
export default defineConfig({
  output: "static",
  basePath: "",
  trailingSlash: false,
});
