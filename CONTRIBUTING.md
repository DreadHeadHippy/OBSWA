# Contributing to OBS Workflow Automation

Thanks for your interest in contributing! Here's how to get involved.

## Reporting Bugs

Open an issue on [GitHub](https://github.com/DreadHeadHippy/OBSWA/issues) and include:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behaviour
- OBS version, Stream Deck software version, and OS

## Suggesting Features

Open an issue with the `enhancement` label. Describe the use-case and why it would be useful to other users.

## Pull Requests

1. Fork the repository and create a branch from `main`.
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Link to Stream Deck for live testing: `npm run install:dev`
5. Make your changes — keep commits focused and descriptive.
6. Run a typecheck before pushing: `npm run typecheck`
7. Open a pull request against `main` with a clear description of what changed and why.

## Code Style

- TypeScript with strict mode enabled — no `any` types without justification.
- Prefer `async`/`await` over raw Promises.
- All Promises must be awaited, `.catch()`-ed, or explicitly marked `void`.
- Keep OBS logic in `src/obs/`, action logic in `src/actions/`, shared types in `src/types.ts`.

## Project Structure

```text
src/
  actions/      # Stream Deck action handlers
  obs/          # OBS connection + workflow execution
  types.ts      # Shared TypeScript types
com.dreadheadhippy.obswa.sdPlugin/
  ui/           # Property Inspector HTML/CSS/JS
  assets/       # Icons
  manifest.json # Plugin manifest
scripts/        # Build helpers (icon generation, packaging)
```

## Security Issues

Please do **not** open a public issue for security vulnerabilities.
See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
