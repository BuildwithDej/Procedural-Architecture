# Research

Only sources opened for milestone 1 are listed. The generator topics below were not read. Do not treat them as researched.

## Consulted

### Vite guide — Getting Started

- https://vite.dev/guide/
- Opened while scaffolding this app.
- Takeaway: `index.html` is the entry, not a file buried in a server. This project needs Node 22.12 or newer (Vite’s current major also accepts 20.19+). `npm create vite` with the `vanilla-ts` template, then `vite`, `vite build`, and `vite preview`.
- Applies to: the scripts in `package.json` and the dev server on port 43123.
- Uncertain: nothing for this milestone. Production browser targets were not tuned.

### Vitest guide — Getting Started

- https://vitest.dev/guide/
- Takeaway: tests are files named `*.test.*`. `vitest run` executes once and exits. Vitest reads the Vite config. The guide asked for Vite 6.4+ and Node 22.12+.
- Applies to: `tests/` and `vite.config.ts`.
- Uncertain: nothing for these unit tests. They do not need a browser.

### three.js `OrbitControls` (installed source)

- `node_modules/three/examples/jsm/controls/OrbitControls.js` in three.js 0.187.0, plus the matching notes in `@types/three`.
- The docs index at https://threejs.org/docs/#examples/en/controls/OrbitControls lists `OrbitControls` under addons. A fetch of `https://threejs.org/manual/en/creating-a-scene.html` returned 404, so the camera behaviour below is from the installed source, not from that manual page.
- Takeaway: left-drag orbits, the wheel zooms, right-drag pans, and `update()` is required when damping is on. For `OrthographicCamera`, zoom changes `camera.zoom` and calls `updateProjectionMatrix`. It does not dolly the camera distance unless zoom-to-cursor is on. The orthographic type itself says an object’s size does not depend on its distance from the camera. `left`, `right`, `top`, and `bottom` are the frustum; `updateProjectionMatrix()` runs after they change. Near must be less than far.
- Applies to: `src/view3d/scene.ts` and `src/view3d/frame.ts`. Scroll zooms. Resize recomputes the frustum. The fit tests in `tests/frame.test.ts` check the parallel projection without starting WebGL.
- Uncertain: how large a room WebGL will still draw cleanly. The unit tests accept a 40 m room and a 0.05 m room as finite geometry. The browser check uses the built-in tiny and huge examples.

## Not consulted

These were named for later and were not opened for milestone 1:

- CityEngine and CGA
- Müller et al. 2006, Procedural Modeling of Buildings
- Wonka et al. 2003, Instant Architecture
- Merrell et al. 2010, Computer-Generated Residential Building Layouts
- Wave function collapse, Townscaper, Grasshopper, Houdini
- The Sims build mode, OR-Tools
- Shape grammars, binary space partitions, and graph floor plans, beyond the names

No paper, manual, or sample from that list was read. There is no reference image in the repo. `plan-01.png` was not provided and was not invented.
