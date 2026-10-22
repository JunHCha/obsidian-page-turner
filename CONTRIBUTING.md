# Contributing

## Development

Node.js 20 and npm are required.

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
```

Contributions are welcome through pull requests. The `main` branch is protected, so submit changes on a branch and open a pull request.

## Releasing

Create a release branch from the latest `main`, then bump the version without creating a local commit or tag:

```sh
npm version <patch|minor|major> --no-git-tag-version
```

This updates `package.json`, `manifest.json`, and `versions.json`. Open a pull request with those changes and merge it after CI passes. Then update your local protected `main` branch and publish the version tag shown in `manifest.json`:

```sh
git tag <version>
git push origin <version>
```

The release workflow builds the plugin, verifies that the tag matches `manifest.json`, creates a GitHub release, and attaches `main.js`, `manifest.json`, and `styles.css`.

