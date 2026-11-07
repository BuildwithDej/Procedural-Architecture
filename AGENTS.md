# Working on Dej

Read this at the start of a session, then the status at the top of `ARCHITECTURE.md`.

Dej is an architecture student who models in 3D and is learning to code. Before a change, say what the inputs are, what the output is, and what consumes it. After the change, say what is different. Plain language.

## Milestone gate

Do one milestone, test it, and stop for Dej’s approval. Do not start the next milestone in the same session unless Dej asks.

1. Draw one room from width and depth. **Done.** Height, one door, and one window are included so the room can be drawn. Orthographic camera. Dark desktop layout.
2. Draggable wall handle.
3. Bed, wardrobe, desk and chair.
4. Separate rules file and clearance checks.
5. Stable re-solve when a dimension is dragged.
6. Visible failure for every impossible rule.

Not in scope until Dej says so: multiple rooms, prompts as the product, parcels, multiplayer, accounts.

## Rules for the work

- The room object is the source of truth. Views only draw it. A future drag changes numbers, then re-solves. It does not store the mesh as the model.
- Rules, when they exist, are data. The solver is separate. It does not exist yet. Do not invent solver decisions, and do not pretend a clearance passed.
- Ambiguous rules are questions for Dej, not guesses.
- The milestone 1 plan is an empty room. The concept image’s furniture and extra partitions were an accident. Do not add them.
- Keep the 3D view orthographic unless Dej asks to change it.
- The future tracing sheet (warm off-white page, charcoal lines, faint dimensions, hideable muted-blue sketches, inside the dark shell) is documented in `SPEC.md`. Do not build it until that milestone is approved.
- No reference image was supplied. Do not create `plan-01.png` or any stand-in for it.
- Record prompts you actually recommend in `PROMPTING.md`, and say they were written for the repo unless Dej wrote them.
- Record sources you actually open in `RESEARCH.md`. Do not mark the generator papers as researched until someone reads them.
- A decision-log panel is for a later milestone. Do not add one just to narrate this session.
- Tests: typecheck, unit tests for dimensions and for model-to-view projection, and a real look in the browser when the picture changes. Report the sizes you actually tried. A blocked-door check is not a pass until furniture and clearances exist.

`SPEC.md` is the condensed brief. `ARCHITECTURE.md` is the map.
