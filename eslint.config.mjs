import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**"]
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "esbuild.config.mjs", "version-bump.mjs"]
        }
      }
    }
  },
  {
    files: ["*.mjs"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off"
    }
  },
  {
    files: ["src/main.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/commands/no-plugin-id-in-command-id": "off",
      "obsidianmd/commands/no-plugin-name-in-command-name": "off"
    }
  },
  {
    files: ["src/settings.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off"
    }
  }
]);
