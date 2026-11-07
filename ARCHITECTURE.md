# Architecture

Milestone 1 is in place. One rectangular room is drawn from width, depth, and height, with its door and window, in an orthographic 3D view and a 2D plan. Both views read the same room data. The workspace is the dark desktop layout Dej chose. Milestone 2 (a draggable wall) has not started. The room study is still empty. A separate asset preview holds the first bedroom set, a wall-mounted desk, and a modular wardrobe. Rules and the solver are not implemented. No reference plan image was provided.

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

## Asset library

The room study does not import these models. They are a second page, `asset-preview.html`, so the orthographic empty room stays as it was.

```
mattress size id  →  fixed US width and length (metres)
bed frame allowances, desk spec, or wardrobe request
        →  plain meshes (positions, normals, indices) and footprint metadata
        →  asset preview (Three.js) or GLB export
later solver  →  reads footprint and clearance metadata, not the dressed mesh
```

| Piece | What the numbers mean |
| --- | --- |
| Mattress | Width and length from the Sleep Foundation size chart, converted at 0.0254 m per inch. Thickness is a model choice. The preview shows queen only. |
| Bed footprint | Frame around that mattress: side overhang, foot overhang, headboard thickness. The duvet and pillows can stick out of this box. They are dressing, not the footprint. |
| Clearance | 0.60 m at the sides and 0.90 m at the foot. Placeholder comfort values. Not a code minimum. |
| Nightstands | Two wall-hung drawer boxes on cleats. The cleat is the support in the model. Structural fixing is not assessed. |
| Feature wall | Fixed-width timber modules. A longer wall adds modules. It does not stretch a module. Bed surround is what the preview shows. Full wall is the same repeater with the LED still centred on the bed group. |
| LED | An emissive strip plus two rectangular area lights, one washing up the panels and one washing down toward the bed. Not global illumination. An edit is an offset from that automatic run, so a later resize can reapply it. If the run would leave the wall or cross an opening, the layout returns alternatives and does not clip it. |
| Desk | One wall-mounted oak top, 1.20 × 0.52 × 0.032 m, surface at 0.74 m, on three pale brackets. The floor under it is clear. The mount record says the desk needs a wall and that the fixing is not assessed. Sizes are design choices. |
| Wardrobe | A request: bay count, clear bay width, usable depth, height, and a section per bay (hanging, shelves, drawers, or hanging over drawers). Carcass thickness stays 0.018 m. Usable depth is not shrunk to force a fit. An invalid request returns errors and a suggested alternative. It does not build a quiet compromise. Two valid requests are in the preview. Door swing is an access envelope outside the closed footprint. |

Generated files in `library/` are the queen bedroom set, the desk with its computer, both closed wardrobes, and `metadata.json`. The GLB has the meshes and material factors. The page adds procedural fabric and timber textures that are not photographs. Grain is one texture tile per module, so a repeated panel is not a stretched panel.

The desk carries one generic computer: a slim blank screen on a neck and base, a keyboard, and a mouse. They sit on the top. The screen has no trademark and no interface.

## First fit

`fit.html` is a demo, not a finished solver. It places the bed group, then the desk, then the wardrobe, in a rectangular room. The same placement drives the plan rectangles and the 3D meshes.

- The bed, two nightstands, and the wall treatment are one group on the chosen wall.
- Side clearance is 0.60 m of clear floor outside that group. Foot clearance is 0.90 m beyond the foot. Both are product choices, not a legal minimum.
- A door or window on that wall blocks the stretch it occupies. Door swing is the bounding box of the existing swing arc. The wardrobe also reserves its open-door sweep.
- Full wall repeats the 0.40 m module from the start of the wall and drops a module that would pass the end or cover an opening. Bed surround uses the modules built with the bed. LEDs stay centred on the bed. If that run would leave the wall or cross an opening, the bed is not placed and the opening is not moved.
- Mattress size and wardrobe sections are never changed to force a fit. A failed bed wall can offer another wall, or the other panelling mode, only after that alternative places the bed. The button applies it. Nothing is applied by itself.
- Invalid, non-finite, and huge rooms do not start a grid search. A huge room centres the bed.
- If the desk or wardrobe has no free stretch, it stays unplaced and the reason is shown. The bed can still be placed.
- Straight rectangular rooms only. No tracing, no voice, no polygon rooms, and no code-compliance claim.

The desk's wall is a locked intent, defaulting to the wall opposite the bed, so a later television could share that sightline. None is modelled. The wardrobe defaults to the sitter's left of the bed (west when the bed faces north). If that wall cannot take the piece, it stays unplaced and another wall is offered only as a button. The chair's 0.45 m seat and 0.35 m pull-out are assumptions. The pull-out is part of the desk's checked volume.

Feature-wall panels stand in the room. Their backs are 2 mm proud of the interior face (`MOUNT_CLEARANCE_M`), and their 20 mm thickness projects inward. The headboard band bites 8 mm into the panel face and does not enter the wall solid. The same gap is used for the desk and wardrobe backs. Flush contact between the headboard and the panel is intentional. The room wall is not hidden and depth testing is unchanged.

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
