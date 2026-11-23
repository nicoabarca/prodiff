# Effect size is a warm ramp

**Status:** Accepted. Supersedes the single red in 0026.

ADR 0026 drew a significant difference in one red and its magnitude as a meter of four bars. A DFG edge could not carry the meter, so the DFG showed only that a test differed.

After 0026 the Group colours are cold: blue, teal, green, violet and slate, plus one ochre. The warm hues are free, so effect size can take them without a Group reading as a finding.

**One ramp carries magnitude.** `--effect-1` to `--effect-4` run from sand (negligible) through orange to wine (large), after ColorBrewer's OrRd. Lightness falls and chroma rises along the ramp, so the order still reads in greyscale. Each step has its own ink, `--effect-foreground-1` to `--effect-foreground-4`, for text on its fill. `effectColor` in `tree/utils/effect.ts` maps a step to both.

**The meter stays, in the ramp's colours.** `effect-meter.svelte` draws four bars, each filled in its own step up to the test's step and grey after it, so the strongest band reads by count and by colour. Vertically it stacks largest on top, hangs below the node badge and from the corner of a tree edge label. Horizontally it sits beside each attribute in the detail panel.

**Every finding takes its strongest step.** The node badge fills with the step of its strongest test. A tree edge label is bordered in its test's step, and a DFG edge is stroked in the step of its strongest significant test. The effect chip and the case strip dots fill with their own test's step.

**Consequences:** A DFG edge shows magnitude again, by colour alone. The sand step is pale on a white background, so a thin sand border or line is less visible than a dark one. The Statistics view still draws its effect bars in `--destructive` and does not follow the ramp. `--group-10` is ochre and sits near the sand and orange steps.
