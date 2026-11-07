# Procedural Architecture

Draw a site boundary. Choose 1 to 5 floors. A seeded generator builds a stepped exterior inside that outline. Each floor is a hollow shell: a slab and a perimeter wall. There are no rooms and no furniture.

## Try it

`127.0.0.1` means the computer where this app is running.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Click corners on the board. Distances are metres. East is to the right and north is up. Corners snap to 0.5 m. Click the first corner to close the outline, then drag a corner to adjust it. Rectangle, L, notch, and skew are starting outlines.

The floor count is a whole number from 1 to 5. New seed builds another massing from the same outline. The roof, the slabs, and the open south side only change what is drawn. The shells stay in the data.

## Sizes in this version

Floor height 3.2 m, slab 0.28 m, and wall 0.25 m are design choices. They are not a structural size or a code minimum.

This editor accepts one simple outline of at least 18 m², with sides of at least 0.8 m, at most 48 corners, and coordinates inside ±500 m. Those are support limits of this version. A smaller site is not illegal here, and the limit is not a claim that it cannot hold a building.

Upper floors sit on the plate below. They do not cantilever. The roof is a flat cap on the top plate. The same boundary, floor count, and seed rebuild the same form.

## Check

```bash
npm test
npm run typecheck
npm run build
```
