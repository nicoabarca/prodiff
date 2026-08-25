# Significance Tests

What the app computes when it says two Groups differ, and what it deliberately does not compute. Written before the Groups refactor so it doubles as a regression baseline: with two Groups, none of the numbers described here may change.

Everything lives in `src-tauri/src/tree/stats.rs`, called from `src-tauri/src/tree/mod.rs`. The frontend renders what it is given and never re-derives a p-value.

## What is being compared

A Significance Test always compares one attribute across exactly two Groups. There are two kinds of test, chosen by the attribute rather than by the user:

- **Numeric attributes** get **Mann-Whitney U**, two-sided. It tests whether one Group's values tend to rank above the other's. It is a rank test, so it makes no normality assumption and is unbothered by the long right tails durations always have.
- **Categorical attributes** get **Pearson's chi-square** over the value × Group contingency table. It tests whether the mix of values differs between Groups.

Neither test is applied to an attribute the user has hidden, and `Activity Duration` and `Transition Time` are treated as ordinary numeric attributes even though they are derived rather than mapped.

Tests are computed at two levels. **Node-level** tests compare the events sitting at one node of the tree. **Case-level** tests compare one value per case, over the whole Group, and appear once rather than per node.

## Mann-Whitney U

The implementation is the normal approximation, not the exact permutation distribution.

Ranks are **midranks**: tied observations share the average of the ranks they span, and the tie correction term `Σ(t³ − t)` is accumulated as they are found. `U` is computed from Group A's rank sum as `R_A − n₁(n₁+1)/2`. Under the null, `U` has mean `n₁n₂/2` and variance

```
n₁n₂/12 · ((N + 1) − Σ(t³ − t) / (N(N − 1)))
```

with `N = n₁ + n₂`. The test statistic is `z = (|U − μ| − 0.5) / σ`, where the `0.5` is the continuity correction and the subtraction is floored at zero so a difference smaller than the correction cannot produce a negative `z`. The p-value is `2(1 − Φ(z))`, clamped to `[0, 1]`.

**Zero variance means every observation in both Groups is identical.** There is nothing to detect, so the p-value is exactly `1.0` rather than a division by zero.

The effect size is the **rank-biserial correlation**, `2U/(n₁n₂) − 1`, which runs from `−1` to `+1`. It is shipped twice: `effect_size` is its magnitude, and `effect_signed` keeps the sign, because the sign is what says *which* Group ranks higher. Positive means Group A ranks higher.

**Known limitation:** there is no exact branch for tiny samples. The normal approximation is adequate from `n = 5` up, which is where the gate sits, but a finding at exactly `n = 5` should not be defended to a statistician without adding an exact permutation test first.

## Chi-square

The contingency table is values × two Groups. Expected counts are the usual `row total × column total / N`, and cells with an expected count of zero are skipped rather than contributing an infinity. Degrees of freedom are `values − 1`, which is `(rows − 1)(columns − 1)` with two columns.

**An attribute with fewer than two distinct values across both Groups is not tested at all** — zero degrees of freedom, nothing to say. The payload carries an explicit null there, so the interface can distinguish "not testable" from "not yet computed".

The effect size is **Cramér's V**, `√(χ²/N)`. With two Groups the general denominator's `min(r−1, c−1)` term is `1`, so the simpler form is correct here and only here. Adding a third Group would make this formula wrong.

Chi-square is **non-directional**: it says the mixes differ, not which way. So it ships no `effect_signed` and no direction, and it never participates in Attribute Co-movement.

## The gates

Two filters stand between a computed p-value and a claim on screen.

**Minimum group size.** `MIN_GROUP_CASES = 5`. If either side has fewer than five observations, no test is run and the payload carries a null. This is hardcoded, not exposed as a setting: lowering it manufactures findings rather than revealing them.

**Multiple-comparison correction.** A tree with 400 nodes and 6 attributes is 2,400 tests. At α = 0.05, roughly 120 of them come back "significant" on pure noise. So every p-value passes through **Benjamini-Hochberg** at α = 0.05, controlling the false discovery rate rather than the family-wise error rate — the right choice for exploratory work, where the cost of missing a real effect is higher than the cost of one false lead.

The implementation sorts the family, finds the largest `i` where `p₍ᵢ₎ ≤ (i/m)·α`, and returns that p-value as the cutoff. Every test at or below it is significant. When nothing survives it returns a value below zero, so the comparison at the call site needs no special case.

**The family definition matters more than the procedure.** A family is *one attribute across every node of the tree*. Six attributes on a 400-node tree is therefore six families of up to 400 tests each, not one family of 2,400 and not 400 families of 6. Case-level attributes form their own separate family, one test each, because they are not per-node quantities at all.

That choice is deliberate: correcting each attribute independently means a noisy attribute cannot suppress findings in a clean one, while still preventing a single attribute from producing dozens of spurious nodes.

## Attribute Co-movement

Within one node, every pair of attributes that both produced a **significant** test with a **signed** effect is reported as either `concordant` (both effects point the same way) or `divergent` (opposite ways).

Two consequences follow from the definition. Chi-square never appears, because it has no sign. And a pair where neither difference is real is never reported — a co-movement between two non-findings says nothing.

## Assumptions, and where they break

**Independence between Groups is assumed and is not always true.** Both tests assume the two samples are disjoint. Groups in this app are free to overlap: comparing a Group against the Event Log compares a set against a superset containing it, which is the most severe case, and two Groups from unrelated Filter Lists can share cases too.

Overlap does not invalidate the descriptive summaries — the medians, boxes and counts are exactly what they claim to be. It biases the *inference*: shared cases appear on both sides, which pulls the two distributions toward each other and makes the test **conservative** in the usual direction. A significant finding under heavy overlap is therefore not a false alarm so much as an understatement; the reverse — a null result under heavy overlap — is the one to distrust.

The overlap count travels in the payload as `overlapCases` so this is visible rather than silent. Removing the intersection automatically was considered and rejected; see `docs/adr/0006`.

**Independence between observations is assumed within a Group.** At node level the observations are events, and a case that visits the same node twice contributes twice. For a prefix tree that is rare but not impossible.

**No omnibus test exists.** Every comparison is pairwise between exactly two Groups. If the interface ever offers three, comparing them pairwise without an omnibus test first (Kruskal-Wallis H, or a K×C chi-square) inflates the error rate again, and Cramér's V would need its full denominator back. The payload shape admits N Groups; the statistics deliberately do not.

## Reading a result

A `Test` in the payload carries: which test ran, the raw statistic, the uncorrected p-value, the effect magnitude, the signed effect where one exists, whether it survived correction, and which Group ranks higher.

The p-value shipped is always the **raw** one. `significant` is the corrected verdict. Both are shipped because the raw p-value is what a reader recognizes, while the boolean is the only one that accounts for how many tests were run alongside it. Sorting by p-value and reading down the list is therefore not the same as filtering by `significant`, and the interface should prefer the boolean.
