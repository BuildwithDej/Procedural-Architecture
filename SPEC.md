# Dej — condensed brief

This is a faithful condensed brief for later sessions. It is not a verbatim copy of the original request.

Dej is an architecture student with 3D modelling experience and some coding knowledge. Explain a change in plain language before and after it: inputs, outputs, and who consumes them. Teach prompting, research, and how to read docs (overview, then concepts, then examples, then reference). One milestone at a time. Stop for Dej’s approval before the next one.

## Milestone 1 (this version)

A browser-only Vite + TypeScript + Three.js study of **one rectangular room**. The room is plain data: interior width, depth, and height in metres, plus a door and a window. An orthographic 3D view and a small 2D plan both read that same data. There is no backend.

Dej chose a **dark workspace** for this milestone: a wide desktop layout, a slim top bar, a compact dimension inspector on the left (about a fifth of the width), a large charcoal 3D workspace with a softly lit pale empty room, and a small plan overlay at the bottom right. Hairline borders, crisp type, restrained controls. The attached desktop image is a visual guide only. Its 4 × 5 × 2.8 figures and the furniture or partitions in its plan are not the room data.

Dej also asked for an **orthogonal view**. The 3D camera is `OrthographicCamera`: parallel projection, orbit, zoom, and a frustum that refits tiny and huge rooms and viewport resizes.

After seeing the running room, Dej asked for softer daylight and for the two front walls to be lowered in the picture, like a cutaway model. The lowering is render-only. It does not change the room data or the plan.

Out of milestone 1, even if the data shape mentions them: wall dragging, furniture, a rule solver, tracing, prompts, accounts, multiplayer, more than one room.

## Later single-room milestones

Complete and test one, then wait.

1. Draw the room from width and depth. **Done here**, including height, one door, and one window, because a room cannot be drawn without them.
2. Draggable wall handle.
3. Bed, wardrobe, and desk with chair.
4. A separate rules file and clearance checks.
5. Stable re-solving when a dimension is dragged.
6. Visible failure states for rules.

Still out of scope until Dej says otherwise: multiple rooms, prompts as the interface, parcels, multiplayer, accounts.

## Source of truth

Plain JSON-like data is the model. The renderer only draws it. Dragging, when it exists, changes parameters and then re-solves. It must not treat a mesh as the state.

Rules are data, separate from the solver. None of that solver exists yet. Door and window clearances are **not implemented**. Do not report them as passing.

Stability, once there is a solver: unlocked furniture moves as little as possible; locked items stay unless they no longer fit, and a conflict is explained rather than silently moved. Approximate solve while dragging, exact solve on release. Remove optional items before reporting that a mandatory rule failed. Every impossible rule shows a red outline and a plain-language message. Silent overlaps are not allowed.

### Coordinates

- Metres.
- Origin at the interior southwest corner, on the floor.
- +X east (width), +Y up (height), +Z north (depth).
- North and south openings are measured from the west end. East and west openings are measured from the south end.
- The plan cut is 1.20 m above the floor, or half the room height when the room is shorter than about 1.25 m. North is up.
- Wall thickness (0.12 m) is a drawing constant outside the interior size.
- The door’s hinge, for the swing graphic only, is at the start of the opening. The leaf swings 90° into the room. This is a drawing assumption, not a clearance check.
- Furniture anchor and rotation are **not chosen**. Ask Dej before milestone 3.

Door `height`, window `sill`, and window `height` are stored even though the short tuple in the brief was only wall, position, and width. They are in the data so the drawing does not hide them in the renderer.

### Placeholder rules (not implemented)

Metres, editable later, not verified building code:

- Bed: 0.6 m clear on both long sides, 0.9 m at the foot.
- Wardrobe: 0.9 m in front.
- Desk: 0.9 m behind the chair.
- Walking path: 0.9 m anywhere.
- Door swing clear of furniture, radius equal to the door width.
- No tall furniture blocking a window.
- Furniture inside the walls.

Ambiguous rule interpretations are raised with Dej before they are implemented. They are not guessed.

## Longer-term generator (not this version)

A procedural building stays **inside** a boundary. It does not fill the boundary with one box. The building is several rectangular volumes with heights, offsets, steps, and projections. Outdoor court, terrace, garden, and water are first-class spaces. Generation is seeded and reproducible. Many legal candidates are scored by soft goals.

Hard constraints: boundary, setbacks, building code, clearances, maximum site coverage.

Soft goals: lower coverage, edge articulation (perimeter against area), distinct offsets and facade planes, indoor-outdoor adjacency, daylight (every habitable room touches the exterior or a court).

Later acceptance idea: the same boundary and 10 seeds produce 10 visibly different legal plans, and none of them fills the boundary.

Dej’s reference, in words only (no image was supplied): a small building on a large irregular plot; garden, water court, and terraces as outdoor rooms; an entry–living–dining–kitchen spine; offset bedroom and service wings; a projecting terrace; walls that run out into the garden; orthogonal building logic inside an irregular plot.

Keep the data shape compatible with that future. Do not build it now.

## Tracing, later

Do not build this until Dej approves that milestone.

The tracing surface Dej described is a **full-workspace warm off-white drawing sheet inside the dark shell**. Plan lines are crisp charcoal. Dimensions are faint. Sketches are a separate muted-blue layer that can be hidden. That sheet is not the milestone 1 plan overlay. Milestone 1 keeps a small empty-room plan on the charcoal workspace.

Separate intent from geometry: hide, edit, delete, and undo. Pinned marks are treated as locked. Hard constraints still win, and the nearest valid alternative is explained.

Intent mode: lasso or paint, plus free-text labels, become a structured room type, requirements, and adjacencies. A language model only interprets. The generator or solver draws.

Draw mode: freehand walls are straightened and joined. Thickness comes from rules. The strokes are kept.

One clarifying question at a time, with a sensible default, and only if the design would change.

Stroke: id, points, type (wall or region). Intent: id, region polygon, label, parsed room type, requirements, status (understood, needs-question, or conflicts).

Pipeline: stroke, then region and wall detection, then a label spec, then rules, then generator or solver, then a result and maybe a question.

Later tracing milestones, in order: the tracing layer and draw tool; lasso with a hardcoded bedroom; free-text interpreted into a spec; questions and defaults; wall cleanup.

## How to work with Dej

- Session start: about five lines of status (see `ARCHITECTURE.md`).
- Useful prompts go in `PROMPTING.md`, with a one-line reason. Do not attribute a prompt to Dej unless Dej wrote it.
- Sources actually read go in `RESEARCH.md`, with a takeaway, where it applies, and what is still uncertain. Prefer official docs, papers, and working code. Do not claim a topic was researched when it was not.
- A future decision-log panel, if it is built, records plain-language choices and rejections. It is not a dump of hidden reasoning, and it is not built in milestone 1. Do not invent solver decisions before a solver exists.
- Give Dej one small review task tied to the work just finished.
