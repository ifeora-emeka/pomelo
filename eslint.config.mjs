import { config as baseConfig } from "./packages/eslint-config/base.js";

export default [
  ...baseConfig,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/www/**",
      "apps/docs/**",
      "apps/playground/**"
    ]
  }
];
