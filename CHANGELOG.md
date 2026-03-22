# Changelog

All notable changes to **OBS Workflow Automation (OBSWA)** will be documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

> Active development — not yet submitted to the Elgato Marketplace.

### Added

- **Workflow builder UI** — Add, reorder, and delete OBS actions in the Stream Deck Property Inspector without writing any configuration
- **14 action types** — Switch Scene, Toggle Source, Set Source Visibility, Mute, Unmute, Toggle Mute, Start/Stop/Toggle Streaming, Start/Stop/Toggle Recording, Trigger Hotkey, Set Text Source, Wait
- **Global OBS connection** — Single shared WebSocket connection across all OBSWA buttons; configure once, works everywhere
- **Test Connection flow** — One-click connection test with live status indicator showing OBS version on success
- **Live OBS data population** — Scenes, audio sources, and hotkeys fetched from OBS and loaded into dropdowns automatically on connect
- **Sequential workflow execution** — Actions run in order with per-action success/failure tracking; a failed action does not abort the chain
- **Double-trigger guard** — Button re-presses while a workflow is executing are safely ignored
- **Exponential back-off reconnect** — Automatically reconnects to OBS after a dropped connection (up to 8 attempts, doubling delay each time)
- **10-second connection timeout** — Prevents the UI from hanging indefinitely when OBS is unreachable
- **Workflow label** — Sets the button title on the Stream Deck automatically
- **Security hardening** — Host/port validation (SSRF prevention), passwords never logged, sanitised error messages, CSP on the Property Inspector blocking external requests

### Fixed

- Plugin startup crash caused by esbuild passing TC39 decorator syntax to Node.js unchanged — switched to Rollup for bundling
- `setSettings` / `getSettings` race condition — connection settings are now sent directly in the `testConnection` payload, eliminating the gap between `setGlobalSettings` and `getGlobalSettings`
- Workflow settings not persisting — `setSettings` was using the wrong context UUID; corrected to use `inPropertyInspectorUUID` per SDK v2 requirements
- "Connecting…" stuck state — added connection timeout so failures surface as readable error messages instead of hanging indefinitely

---

[Unreleased]: https://github.com/DreadHeadHippy/OBSWA/commits/main
