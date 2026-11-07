# Research

Lab notebook for milestone 1. It lists ideas we actually tried, what worked, what failed, and what we threw out. It is not a literature review. Nothing below is a solver result. Papers named for a later generator were not opened.

## Asset preview

Dej asked for original models after the GitHub import, then a wall-mounted desk, then a wardrobe that follows storage requirements. Reference photos stayed out of the repo. Nothing here is placed in the room study, and nothing here is a solver.

| Choice | What it is | Where |
| --- | --- | --- |
| Queen preview, other US sizes kept as data | Sleep Foundation chart, 7 Nov 2026: twin 38×75, twin XL 38×80, full 54×75, queen 60×80, king 76×80, California king 72×84 inches. Metres are inches × 0.0254. Thickness is not on that chart. The model uses 0.28 m. | `src/library/mattressSizes.ts` |
| Frame separate from the mattress | Side overhang 0.055 m, foot 0.05 m, headboard 0.11 m thick. Duvet and pillows are outside the bed footprint. | `src/library/bedroomSet.ts` |
| Side 0.60 m and foot 0.90 m | Placeholder comfort only. Not checked against a code. | same |
| Bed surround panels, fixed 0.40 m modules | Repeating modules instead of stretching grain. Full-wall mode exists in `layoutFeatureWall` and is tested. The page shows the surround. | `src/library/panels.ts` |
| LED | Emissive strips plus `RectAreaLight` upwash and downwash on `MeshStandardMaterial`. A 12 m wall keeps the lit run centred on the bed group. An edit that leaves the wall is rejected with the automatic run offered back. | preview page, `panels.ts` |
| Wall-mounted desk | 1.20 × 0.52 × 0.032 m top, surface at 0.74 m, three brackets with plates and struts, small rear cable groove. Inspired by Dej’s first pin (thin timber, pale brackets, open floor), not a copy of it. The Z-frame pin and the glass trestle pin were not modelled. Fixing is not assessed. | `src/library/desk.ts` |
| Wardrobe requests | Three-bay (hang, shelves, hang over two drawers) and two-bay (hang, four drawers). Same 0.018 m carcass. Different bay count, width, depth, and height, so one is not a scale of the other. A 0.40 m usable depth is refused and 0.52 m is suggested. The sections stay as asked. | `src/library/wardrobe.ts` |
| GLB | Real glTF 2.0 binaries written by `scripts/export-assets.ts`. Factors only. Procedural textures stay on the page. | `library/` |

The bedroom page was rebuilt once after the first mesh came out inside-out (bow-tie quads). The second capture shows solid panels, a split upholstered headboard, layered pillows, a draped duvet, two floating nightstands, and a warm strip that lights the timber. Known gaps: the fabric noise is still coarse up close, the duvet folds are broad, brackets are a simple plate-and-strut, and there is no global illumination.

The desk then gained a blank monitor, keyboard, and mouse, checked so they stay on the top and clear of each other. Asset cameras fit the mesh bounds so the whole object is in frame.

`src/library/fit.ts` is the first placer. It is deterministic and does not search a grid. The fits bedroom (5.0 × 4.2 × 2.7 m, door on the south, window on the east) takes the queen group on the north wall. The desk is locked to the opposite wall, in line with the bed, and the wardrobe to the sitter's left. On that room those are the south and west walls. The tiny room and the original example bedroom do not fit, and neither gets a moved window. Clearances stay 0.60 m and 0.90 m as product choices.

The first fit drew the timber panels on the room side of local zero but then placed local zero on the interior face, so the 20 mm panels sat inside the wall solid and z-fought its face. The panels, band, desk, and wardrobe now keep a 2 mm air gap and their thickness in the room. A chair sits in the right-hand gap under the desk, clear of the three brackets, with the back beyond the front edge.

## Kept

| Idea | What we saw | Where it lives |
| --- | --- | --- |
| One room object is the only state. The 3D view and the plan both read it. | Editing width changes both pictures. Invalid numbers (`-2`, `abc`, `Infinity`, a door that no longer fits) show a sentence and do not draw a broken mesh. | `data/*.json`, `src/model/parse.ts` |
| Dark desktop layout. Slim top bar, dimensions on the left, model in the middle, small plan at the bottom right. | Dej chose this after seeing the concept. The running page matches it. | `src/style.css` |
| Orthographic camera. Parallel edges stay parallel. Scroll changes zoom, not camera distance. | Fit tests pass for the example, the tiny room, the huge room, and a 0.4 m room, in wide, square, and tall views. The browser orbit before the lighting pass still looked parallel. | `src/view3d/frame.ts` |
| Example bedroom 4.20 × 3.60 × 2.70 m, not the 4 × 5 × 2.8 written on the concept sketch. | The sketch was a layout guide. Those numbers were not the room. | `data/example-bedroom.json` |
| Empty plan. North up. Cut at 1.20 m, or half the height if the room is shorter. | Door and window show as gaps. A clerestory whose sill is above the cut stays solid wall. No furniture. | `src/plan/project.ts` |
| Door height, window sill, and window height stored in the room data. | The short brief only named wall, position, and width. Hiding those three numbers in the renderer would have made the picture lie. | `src/model/types.ts` |
| Walls 0.12 m thick, drawn outside the interior size. Side walls tuck 1 cm into the long walls. | Interior dimensions stay exact. The corner does not flicker. | `src/model/geometry.ts` |
| Soft daylight on a matte warm-gray model. Key from above and to the south-west, dim fill opposite, low ambient, ACES exposure 1.08. | The after screenshot shows a real shadow on the floor and darker faces, not a flat wash. | `src/view3d/scene.ts`, `/opt/cursor/artifacts/after_lighting_cutaway.png` |
| Two nearest walls drawn at 30% of the height. | The floor reads as a cutaway. Height in the inspector stays 2.70 m. The plan stays a full rectangle. | `src/view3d/cutaway.ts` |
| Which walls are short follows the camera, with a small hold at the centre line. | Unit test: south-east camera keeps south and east; a wobble across the centre does not flip; a north-west camera flips to north and west. | `tests/cutaway.test.ts` |
| Dimension text sits beside the line, not in a gap cut through the stroke. | 3.60 m and 4.20 m are readable in the after shot. | `src/plan/project.ts`, `src/view3d/dimensions.ts` |

## Failed, then replaced

| Idea | What failed | What replaced it |
| --- | --- | --- |
| Even Lambert lighting, a strong ambient fill, and a painted dark blob under the room. | The first running room looked flat. Dej asked for soft daylight after seeing it. The blob would also have fought a real shadow. | Standard matte materials, one shadow-casting key light, a weak fill. The blob was removed. |
| `PCFSoftShadowMap` for a soft shadow. | Three.js 0.187 logs that this type was removed and falls back to ordinary PCF. The warning showed up in the dev server. | Explicit `PCFShadowMap` with blur radius 5, on a 2048² map. |
| Dimension labels as sprites sitting on the dimension line, and plan text in a broken gap in the stroke. | On orbit the sprites bunched at a corner. On the tiny plan the stroke cut through the figures. | Continuous dimension lines. Labels offset outward. |
| `hidden` on the plan `<svg>`. | Typecheck failed. This TypeScript DOM lib does not put `hidden` on `SVGSVGElement`. | A CSS class, `is-hidden`. |
| Plan corner at `(0, -0)`. | A test expected `(0, 0)`. Negating zero produced negative zero. | `worldToPlan` turns zero into plain `0`. |
| Headless Chrome on the default profile, to grab the after screenshot. | Chrome was already open. The second process aborted rather than share the profile. | A separate `--user-data-dir`. That write produced the after image. |

## Trashed

These are not in the app, and they are not waiting as the next step.

| Idea | Why it was thrown out |
| --- | --- |
| Warm off-white page as the milestone 1 workspace. | Dej selected the dark concept. A warm sheet is a different, later drawing surface, not this screen. |
| Perspective camera. | Dej asked for an orthogonal view. Perspective would shrink the far wall and fight the plan. |
| Copying the concept image’s furniture, extra partitions, and 4 × 5 × 2.8 m. | The image was a layout sketch. The furniture in its plan was an accident. Milestone 1 is an empty room. |
| Inventing `plan-01.png`. | No reference image was supplied. A made-up plan would pretend to be Dej’s drawing. |
| A floor grid, and ink edges on every wall box. | Both read as a stock 3D demo. The plan already carries the measured lines. |
| Screen-space ambient occlusion. | Heavy, and easy to get wrong on an orthographic camera. Contact shade is the floor darkening toward the walls plus the real shadow. |
| Variance shadow maps. | Not run. In this Three.js version, receivers also cast, which smears shadows. PCF plus a radius was enough. |
| A decision-log panel in the page. | It would be a second product. This file is the notebook. |
| A second room, wall dragging, furniture, or a rule solver inside milestone 1. | Out of scope until Dej asks. |

## Parked, not trashed

| Idea | Status |
| --- | --- |
| Full-workspace tracing sheet: warm paper inside the dark shell, charcoal lines, faint dimensions, hideable muted-blue sketches. | Written down in `SPEC.md`. Not built. Needs a later milestone. |
| Hinge side of the door. | The graphic hinges at the start of the opening and swings into the room. That is a drawing choice, not a clearance check. Change it if the swing feels wrong. |
| Clearance rules (bed, wardrobe, desk, walking path, door swing, window, stay inside the walls). | Placeholder numbers only. Not verified, not enforced. |
| Orbit after the cutaway: do the short walls actually swap when you walk around the model? | The unit test says which pair is chosen. Nobody re-orbited the lit model in the browser after the cutaway landed. Treat that as unchecked. |

## Sources actually opened

### Vite — Getting Started

https://vite.dev/guide/

`index.html` is the app entry. Node 22.12 or newer. Scripts are `vite`, `vite build`, and `vite preview`. Used for the dev server on port 43123.

### Vitest — Getting Started

https://vitest.dev/guide/

Test files are `*.test.*`. `vitest run` runs once. Vitest reads the Vite config. Used for `tests/`.

### three.js OrbitControls and orthographic camera

Installed `OrbitControls.js` and `@types/three` in three.js 0.187.0. The docs index lists `OrbitControls` under addons: https://threejs.org/docs/#examples/en/controls/OrbitControls

A fetch of `https://threejs.org/manual/en/creating-a-scene.html` returned 404, so the camera notes come from the installed source, not that manual.

Left-drag orbits, the wheel zooms, right-drag pans. With an orthographic camera, zoom changes `camera.zoom` instead of moving the camera in. `PCFSoftShadowMap` is still named in the types, but `WebGLShadowMap.js` warns that it has been removed. That warning is what killed the soft-shadow type above.

Still uncertain: how coarse the 2048² shadow becomes on rooms much larger than the 40 m example. Not measured in the browser after the lighting change.

## Not opened

These names were written down for later. They were not read, and none of them decided milestone 1:

CityEngine and CGA. Müller et al. 2006. Wonka et al. 2003. Merrell et al. 2010. Wave function collapse, Townscaper, Grasshopper, Houdini. The Sims build mode. OR-Tools. Shape grammars, binary space partitions, and graph floor plans, beyond the names.
