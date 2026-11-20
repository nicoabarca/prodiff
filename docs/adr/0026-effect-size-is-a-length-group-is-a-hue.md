# Effect size is a length, a Group is a hue

**Status:** Accepted.

Effect size came in four bands (negligible, small, moderate, large), drawn as four shades of one red. Groups took the dark half of ColorBrewer's Paired scheme, which includes a red, an orange and a brown. Two problems followed. A red, orange or brown Group read as a finding. The two pale steps, negligible and small, could not be told apart on a mark of a few pixels.

The literature points to one cause. Effect size is ordered data, and hue is a channel for categories, so the bands relied on lightness alone. Lightness is weak on small marks (Szafir 2018), and it is read together with hue (Garner's integral dimensions), so the Group hues interfered with it. Length is the strongest channel for ordered data after position (Munzner, after Mackinlay).

**One red marks a finding.** `--effect` is the only effect colour. It fills the node badge and the effect chip, and it borders a tree edge label and strokes a DFG edge. It no longer carries magnitude.

**A meter carries magnitude.** `effect-meter.svelte` draws four rounded bars, filled in `--effect` up to the band and grey after it. Vertically it hangs below the node badge and from the corner of a tree edge label, on a card coloured chip. Horizontally it sits beside each attribute in the detail panel.

**Group colours avoid the red.** The six Group tokens are blue, teal, green, violet, ochre and slate. Each keeps its token name (`group-2` to `group-12`), so a saved Group keeps its slot and takes the new colour.

**Consequences:** A DFG edge shows that a test differs, not by how much. Its magnitude is in the tests panel and the tooltip. The case strip shows which attributes differ, with the strongest band in its text. A Group created before this change changes colour without being edited.
