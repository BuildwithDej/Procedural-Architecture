# Procedural-Architecture

# Dej — one room

A browser study of a single rectangular room. You edit the interior width, depth, and height in metres. An orthographic 3D view and a small plan both draw that same data. The room study stays empty: no wall dragging, no rules engine, and no account. Asset models are on a separate preview page.

The sizes below are demonstration numbers for this study. They are not a building regulation.

## See it

The room study is only a local web page. `127.0.0.1` means the computer where Vite is running, not some other laptop.

Asset models are a separate page and are not dropped into this room: [http://127.0.0.1:43123/asset-preview.html](http://127.0.0.1:43123/asset-preview.html).

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:43123](http://127.0.0.1:43123) in a browser on **that same computer**.

If someone else started Vite on a remote machine, that address opens the app there. It does not open it on your own computer unless you are the one running the command, or a preview link was actually given to you. This repo does not ship a public URL.

Other commands:

```bash
npm test          # validation, plan, and orthographic fit
npm run typecheck
npm run build
npm run preview   # serves the built files on http://127.0.0.1:43124
```

Node 22.12 or newer is required.

## What you should see

A dark, wide layout.

- Top bar: “Room study” and “Milestone 1”.
- Left: Width, Depth, and Height. Example, Tiny, and Huge switch the demonstration room.
- Centre: a pale empty room on charcoal, lit like a matte study model. The two walls nearest the camera are drawn lower so you can see the floor. That is a picture only: the height field and the plan stay full height. Drag to orbit. Scroll to zoom. Parallel edges stay parallel. If you orbit to another side, the lowered walls follow the camera.
- Bottom right: the plan of that same room. North is up. The plan is empty. It shows the walls, one door swing, one window, and the two plan dimensions.

The example bedroom is **4.20 m east–west, 3.60 m north–south, and 2.70 m floor to ceiling**. The door is on the south wall, 0.30 m from the west end, 0.90 m wide and 2.10 m high. The window is on the north wall, 1.20 m from the west end, 1.50 m wide, sill at 0.90 m, 1.20 m high.

Tiny is 1.80 × 1.50 × 2.20 m. Huge is 40 × 25 × 8 m. Those are the same kind of data, not extra rooms on screen.

Type `-2`, `0`, `abc`, or `Infinity` into a field. The page should say what is wrong and should not draw a broken room. A width of `1` is a real number, but the example door no longer fits, so that fails too.

## How the pictures stay honest

`data/example-bedroom.json` (and the tiny and huge files) is the room. `validateRoom` checks it. The 3D view builds wall boxes from that object. The plan is a horizontal cut through those same boxes, normally at 1.20 m above the floor. Editing a number builds a new room object. It does not pull a mesh around and call that the model.

Coordinates: origin at the interior southwest corner, on the floor. +X is east, +Y is up, +Z is north. Metres throughout. Wall thickness is only a drawing thickness of 0.12 m outside those interior sizes.

## What this version does not do

- Drag a wall
- Place a bed, wardrobe, or desk
- Check clearances, including whether furniture blocks the door
- Solve rules, or show the red rule outlines from later milestones
- Trace a drawing, or switch to a full-page 2D sheet
- Add another room, an account, or a server

The dark shell is the milestone 1 workspace. A later tracing mode, if Dej asks for it, would be a warm off-white sheet inside that shell, with charcoal lines and a separate blue sketch layer. It is not in this version.

More of the brief, including the later milestones, is in `SPEC.md`. The system map is in `ARCHITECTURE.md`.

## A review pass

Change Width from 4.20 to 5.00. The plan’s width figure and the 3D room should both lengthen. The north window should still start 1.20 m from the west end. Then set Width to 1. The inspector and the plan card should explain that the south door no longer fits, and the room should not draw. Switch to Tiny and Huge, and resize the browser window: the room should stay in frame, and edges that were parallel should stay parallel.
