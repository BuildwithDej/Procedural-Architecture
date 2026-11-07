# Architecture

The app turns one site outline into 1 to 5 hollow floors. The page is `index.html`. It draws the boundary and a Three.js view of the same form. There is no room study and no furniture.

```
corners (metres) → validateBoundary → site ring
floor count 1..5, seed
        → generateForm → BuildingForm
        → buildFormGeometry → slab, wall, and roof meshes
```

| Record | What it stores |
| --- | --- |
| Site | One simple ring. x east, y north. No holes. |
| Floor `floor-N` | Elevation, outer ring, interior ring, and whether this level stepped in. |
| Slab `floor-N-slab` | The outer ring at that elevation, 0.28 m thick. |
| Wall `floor-N-wall-E` | One outer edge, the matching interior edge, and the clear height above the slab. |
| Roof `roof` | A flat cap on the top plate, same thickness as a slab. |

Ids are rebuilt with the form. The same boundary, floor count, and seed produce the same ids. Nothing in this version drags a wall after generation.

A floor is kept only when its outer ring, interior ring, and each wall quad stay inside the site by a continuous test: no edge may cross the boundary, and the pieces between boundary contacts must lie inside. Sampling points along an edge is not that test. An upper floor must also lie inside the floor below.

The orthographic camera is fit to the site extruded up through the roof, in the camera's own view, with a margin. A resize keeps that view direction and refits the frustum. Changing the outline, floor count, or seed frames the model again.

The site ring is a limit. Coverage, setback, twist, and shape are stored on the form and drive the plates. Shape 0 is a rectangle. Shape 1 rounds each corner with at most five straight segments. Twist turns each upper plate, then shrinks it onto the plate below when the turn would overhang. A note is kept when a slider cannot be met in full.

Every floor has a slab, a closed wall ring, and a cap. The top cap is the roof. A setback leaves a terrace ring. A repeated plate is covered by the next slab, so a second cap is not drawn on the same plane. The model view shows those caps. Plan view can hide the levels above a chosen floor, and its cap, so the interior reads from above. Returning to the model restores every cap.

Each wall is one outer face, one inner face, and a top that shows the thickness. Those faces are wound outward, inward, and up. Neighbouring walls meet at the shared corner. The south-side cutaway is off unless it is switched on, and it only hides faces.

`FORM_DESIGN` holds the 3.2 m floor, 0.28 m slab, and 0.25 m wall. `FORM_SUPPORT` holds the 18 m², 0.8 m, 48-corner, and ±500 m limits. Both are labeled in the page. Neither is a zoning rule.

## Assumptions in force

- One connected plate per floor. No second tower on the same level.
- No cantilever. The upper plate is inside the lower plate.
- Straight edges only. Curves and holes are rejected by not being representable.
- Corners snap to 0.5 m while drawing.
- Every floor is the same height.
- The roof silhouette matches the top plate.
- Editing is the boundary, the floor count, and the seed. View toggles do not change the form.

## Where the code lives

- `src/form/polygon.ts` — rings, insets, setbacks, corner bites, and containment.
- `src/form/generate.ts` — validation and the seeded form.
- `src/form/shell.ts` — meshes for slabs, walls, and the roof.
- `src/form/main.ts` — the boundary board and the orthographic view.
- `tests/form.test.ts` — floors, containment, and determinism.

The old rectangular room solids were boxes for one straight room. They are not the shell of an arbitrary outline, so they are not used here.
