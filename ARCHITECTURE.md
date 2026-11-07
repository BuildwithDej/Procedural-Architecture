# Architecture

Milestone 1 is in place. One rectangular room is drawn from width, depth, and height, with its door and window, in an orthographic 3D view and a 2D plan. Both views read the same room data. The workspace is the dark desktop layout Dej chose. Milestone 2 (a draggable wall) has not started. Furniture, rules, and the solver are not implemented. No reference plan image was provided.

## Map

```
data/*.json  →  validateRoom  →  Room
                                  ├─ wallSolids / glass / door swing  →  orthographic 3D view
                                  ├─ projectPlan (slice of those solids) →  plan overlay
                                  └─ dimensionGuides  →  width and depth ticks in 3D
dimension text  →  applyDimensionText  →  the same Room, or a visible error
```

| Part | Status | Role |
| --- | --- | --- |
| Room data | Implemented | Width, depth, height, door, window. JSON files in `data/`. |
| Validation | Implemented | Rejects empty, negative, non-finite, and openings that do not fit. |
| 3D view | Implemented | `OrthographicCamera` and `OrbitControls`. Draws the room. Does not own the numbers. |
| Plan overlay | Implemented | Empty room only. A 1.20 m cut through the same wall solids. North up. |
| Editor | Implemented | Three numeric fields and three demonstration sizes. Not a wall drag. |
| Rules | Not started | Placeholder list is in `SPEC.md` only. |
| Solver | Not started | Do not invent solver behaviour. |
| Generator | Not started | The long-term boundary generator is described in `SPEC.md` only. |
| Tracing sheet | Not started | See below. Approval required. |

## Presentation

Dej selected the dark workspace for milestone 1.

- Slim top bar: “Room study”, the room name, “Milestone 1”.
- Left inspector, about 20% of a wide screen: width, depth, height.
- Charcoal workspace. Pale open room, no ceiling, soft light on the floor.
- Small plan card at the bottom right. It is empty of furniture. Ignore the partitions that appeared in the concept image.
- Parallel projection, so the room reads like a model on the table, not a photograph.
- The 3D walls nearest the camera are drawn at 30% of the room height. That cutaway is render-only. Width, depth, height, and the plan stay at full height. Orbiting past a centre line swaps which pair is short, with a small hold so the cut does not flicker on the boundary. A window on a shortened wall is clipped with that wall; it is still in the data and in the plan.

Resizing the workspace updates the orthographic frustum for the new aspect and keeps the current zoom and orbit direction. Choosing a new size, or editing a dimension into a valid room, frames the room again.

## Light

The model uses warm-gray matte materials (`MeshStandardMaterial`, roughness near 1). One directional light from above and to the south-west is the key. It casts a 2048² shadow. Three.js 0.187 has removed `PCFSoftShadowMap`, so the soft edge is ordinary PCF with a blur radius of 5, not a variance shadow map. A dim hemisphere, a little ambient, and a fill from the opposite side keep the shaded faces readable. Exposure is ACES Filmic at 1.08. The floor texture is lighter in the middle and warmer-darker at the edges, which stands in for contact shading. There is no screen-space ambient occlusion: it is costly here, and an orthographic view makes it easy to get wrong. On a 40 m room the same shadow map is spread over a much larger area, so the shadow is coarser.

## Camera

`src/view3d/frame.ts` is the projection. `PROJECTION` is `"orthographic"`.

The camera sits to the south-east of the room and looks down. Scroll changes `camera.zoom` (Three.js does this for an orthographic camera instead of dollying the distance). The fit measures the room, including margin for the dimension ticks, in the camera’s right and up axes, then sets the frustum so that content lands inside the view for the current aspect. A 0.4 m room and a 40 m room use the same fit, so neither one is a speck or a clipped wall. Near and far stay finite and positive.

Two points separated only along the view direction share the same screen position. That is the parallel projection. `tests/frame.test.ts` checks it, including wide, square, and tall aspects.

## Plan

`projectPlan` does not invent a second room. It takes `wallSolids`, keeps the boxes the 1.20 m cut passes through, and maps X east and Z north onto the screen with north up. Door swing and window lines are graphics from the same openings. A window whose sill is above the cut stays solid wall, which is what a plan cut means. The cut drops to half the room height only when the room is too short for 1.20 m.

## Future tracing sheet (not built)

When Dej approves a later tracing milestone, the drawing surface can become a full-workspace warm off-white sheet inside this dark shell: crisp charcoal plan lines, faint dimensions, and muted blue sketches on a separate layer that can be hidden. Milestone 1 does not have a full-screen 2D mode or a tracing tool. The current plan stays a small overlay of the empty room.

## Decisions already made

These are presentation choices Dej asked for, or drawing assumptions needed to show milestone 1. They are not solver results.

- Dark workspace, as in the desktop concept.
- Orthographic camera, because Dej asked for an orthogonal view.
- Example bedroom 4.20 × 3.60 × 2.70 m. The concept sketch’s 4 × 5 × 2.8 is not the data.
- Door height, window sill, and window height live in the room data.
- The swing graphic hinges at the start of the opening and opens into the room. Clearance is not checked.

## Glossary

| Word | Meaning here |
| --- | --- |
| Parameter | A number in the room data, such as width. |
| Source of truth | The room object. Views are pictures of it. |
| Interior dimension | Face-to-face size inside the room, in metres. |
| Opening | A door or window: which wall, where along it, and how wide. |
| Constraint | A rule the room must satisfy. Not enforced yet. |
| Hard constraint | A rule that cannot be relaxed, such as staying inside a boundary. |
| Soft goal | A preference used to score legal options, such as lower site coverage. |
| Solver | The step that moves parameters until the rules hold. Not built. |
| Seed | A number that makes one generator run repeatable. Not built. |
| Locked | A future flag. A locked item stays put unless it no longer fits. |
| Clearance | Empty space a rule requires. Not checked yet. |
| Plan cut | The horizontal slice the plan draws, normally 1.20 m above the floor. |

## Where the code lives

- `data/` — example, tiny, and huge rooms.
- `src/model/` — types, validation, wall solids.
- `src/plan/project.ts` — room to plan geometry.
- `src/view3d/frame.ts` — orthographic fit.
- `src/view3d/scene.ts` — Three.js view.
- `src/ui/` — inspector, plan card, and wiring.
- `tests/` — validation, solids, plan, and the orthographic fit.
