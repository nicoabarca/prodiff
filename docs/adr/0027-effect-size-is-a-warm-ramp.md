# Effect size is a warm ramp

**Status:** Accepted. Supersedes the meter in 0026.

ADR 0026 drew a significant difference in one red and its magnitude as a meter of four bars. The meter added a mark beside every badge, edge label and attribute row. A DFG edge could not carry it, so the DFG showed only that a test differed.

After 0026 the Group colours are cold: blue, teal, green, violet and slate, plus one ochre. The warm hues are free, so effect size can take them without a Group reading as a finding.

**One ramp carries magnitude.** `--effect-1` to `--effect-4` run from yellow (negligible) through orange to red (large). Lightness falls and chroma rises along the ramp, so the order still reads in greyscale. Each step has its own ink, `--effect-foreground-1` to `--effect-foreground-4`, for text on its fill. `effectColor` in `tree/utils/effect.ts` maps a step to both.

**Every finding takes its step.** The node badge and the effect chip fill with it, the case strip dots fill with it, a tree edge label is bordered in it and a DFG edge is stroked in the step of its strongest significant test. `effect-meter.svelte` is gone.

**Consequences:** A DFG edge shows magnitude again. The two lightest steps are pale on a white background, so a thin yellow border or line is less visible than a red one. The large step sits close to `--destructive`, which the Statistics view still uses for its own effect bars, so that view does not follow the ramp yet. `--group-10` is ochre and sits between the first two steps.
