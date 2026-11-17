# The DFG's sliders sit on the canvas, and Paths only hides edges

**Status:** Accepted. Supersedes the Paths cut and the staging of [ADR 0019](0019-cut-the-dfg-in-the-variants-panel.md); its Behaviour cut and its seeding stand.

Under ADR 0019 both sliders staged whole Variants in the Variants panel. Paths left out every Variant that ran one rare transition, so moving it also dropped cases, and the Behaviour slider, which reads back the coverage the selection holds, fell with it. Paths at 0% and Behaviour at 100% could not be set together. Readers also expected Paths to add and remove edges, not Variants.

**Both sliders stand at the right of the canvas,** one above the other, each with a plus and a minus button, the way process mining tools lay them out. The tests panel takes its room beside the canvas, so it pushes the sliders over rather than covering them. A split has one pair, for both panels.

**Behaviour builds; it does not stage.** Letting the thumb go builds the graph from the most common Variants up to that share of cases, so every Significance Test is run on the cases drawn. A drag only moves the thumb: the graph never shows a cut its tests were not run on. Plus and minus add or drop exactly one Variant. While Rust builds, the canvas draws the graph the new Variants fold into, numbered the way Rust numbers activities so nothing moves when the build lands; the tests panel and the canvas say the tests are being calculated, and no test is shown until they are. Moving a slider again before the build lands supersedes it: the new preview is drawn at once, the older result is dropped when it lands, and Rust skips building it if the newer request arrived while the Groups were being read. A build already aggregating runs to its end, since a polars query cannot be stopped midway. The Variants panel stays for picking Variants by hand with Apply; moving Behaviour afterwards replaces that pick.

**Paths only hides edges between activities.** It keeps each Group's busiest share of them plus every activity's busiest way in and way out, and always keeps the edges from Start and into End. It never removes a case, never adds an edge, and never re-links through a hidden edge, so everything drawn happened with the counts shown. Since the cases do not change, an activity's figure counts cases whose way in or out is hidden, and the edges on screen around it no longer add up to it; the canvas says how many paths are hidden. A hidden edge's tests leave the tests panel with it.

Hiding activities, the other common slider, was rejected: an activity hidden from the traces re-links its neighbours, and the graph would draw pairs no case ran.

**What a slider adds is lit for a moment.** The activities and edges a slider move adds glow in the highlight colour, then fade out within three seconds, without dimming the rest.

**Consequence:** the Benjamini-Hochberg family of the edge tests still holds every edge of the Variants built. Narrowing it to the visible edges, so that no hidden edge weighs on a visible edge's significance, is a change to the test calculation and follows separately.
