# Standalone design projects

This directory contains interactive design explorations with their own pages and
development workflows. They are intentionally excluded from `pnpm-workspace.yaml`
and must not be imported by the desktop app or Cordis plugins.

## Orb animation

`orb-animation/` is the standalone React, Three.js, and TypeScript character design.
Run its dedicated preview page independently:

```sh
cd design/orb-animation
npm ci
npm run dev
```
