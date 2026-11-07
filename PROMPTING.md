# Prompting

These are starter prompts written for this repo. Dej did not write them. Each one is here because it keeps a later session on the data, and off the next milestone, until Dej asks for it.

1. **“Explain `src/model/parse.ts` as inputs, outputs, and who consumes them, in plain language, before changing anything.”**
   Makes the data flow visible before an edit.

2. **“Add a test that a negative width fails validation and does not produce plan geometry. Do not change the renderer.”**
   Keeps a rule in the model, where both views will see it.

3. **“Show where the plan and the orthographic view both read the same room object. Do not add furniture or a second room.”**
   Guards the single source of truth.

4. **“The 3D view is orthographic. If you change framing, update `frameOrthographic` and the fit tests, and do not switch it to a perspective camera.”**
   Stops a later edit from quietly dropping the projection Dej asked for.

5. **“If a rule can be read two ways, ask before implementing it. Do not pick the reading yourself.”**
   Matches the brief: ambiguous clearances are Dej’s decision.

6. **“Change an asset by editing its plain data: mattress id, desk spec, or wardrobe request. Do not scale the queen mesh. Do not put the asset into the room study.”**
   The preview and the GLB both read that data. Footprint stays separate from the dressed mesh. An invalid wardrobe request should come back as errors and an alternative, not a resized carcass.

7. **“If a fit fails, show the reason and only offer an alternative that already passes the same checks. Do not move the door or window, and do not change the mattress unless the user asked.”**
   `fit.html` is the first placer. It is not a general solver.
