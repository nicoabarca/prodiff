# The DFG tests one observation per case, and owns how

**Status:** Accepted. Settles the consequence left open by [ADR 0023](0023-dfg-sliders-on-the-canvas.md).

A case passes through a tree node once and can visit a DFG activity many times, so the DRT's tests cannot run on a DFG place unchanged. Two events of one case are not independent: counting events let one long case weigh as many, and on a log where most cases loop, an A/A split (two random halves of one log, where every finding is false) found a false difference in every split when categorical values were counted per event, and in 15% of splits when durations were. Counted per case, every test stayed near 5% on the four logs tried. The method is chosen in `dfg/significance.rs`, and `analysis`, `tree` and `statistics` stay untouched.

**Every test names its cases and gives each one value.**

- Activity Frequency: every case of the Group, whether it reaches the activity.
- Repetitions: the cases reaching the activity, whether they run it more than once.
- Edge Frequency: the cases reaching the source, whether they ever follow the edge. A case ending at the source counts as reaching it.
- A numeric attribute, Activity Duration and Waiting Time: the cases that ran the activity or followed the edge, each at its mean.
- A categorical attribute: the cases reaching the activity with a value, one test per value, whether the case ever held that value there.

A numeric value takes Mann-Whitney. Every other test is a two-by-two of cases, decided by chi-square while Cochran's rule holds and by Fisher's exact test otherwise.

**A categorical attribute is tested value by value.** When a case holds several values at one activity (Ana and Bo both run it), the values stop being exclusive and their counts sum above the cases, so one chi-square over all values no longer holds. "Did the case ever hold Ana here" is a yes or no for every case, so it can be tested in any log, and the finding names the value. Each value's test joins its attribute's Benjamini-Hochberg family across activities. Values are tested this way even where every case holds one, so one rule holds everywhere.

On synthetic logs, a test per value found one value doubling more often than one chi-square per activity (96% against 86%, 1000 cases per Group), and missed a small shift spread over every value more often (60% against 94%). That spread shift names nobody and is not reported. A first level testing each attribute at each activity can be added above the values later without changing them.

"Ever held" rises with the visits a case makes: when one Group runs an activity again more often, each value shows up in more of its cases. The share of each case's runs holding the value was tried instead. It does not rise with visits, but it missed every case of one Group switching value on its retries. Repetitions at the same activity shows the extra visits, and the card says a case with several values counts under each.

**Edge tests are corrected across the edges drawn.** Rust ships each edge's p-value uncorrected; `graphFindings` runs one Benjamini-Hochberg family per attribute over the edges the Paths cut leaves, so hidden edges weigh on nothing and the panel, the badges and the red of an edge describe what is on screen. Activity families stay in Rust, across the activities of the Variants built, since Paths never hides an activity. Lowering Paths therefore makes the correction milder on the edges that remain.

Paths keeps each Group's busiest edges, a choice that depends on the Groups' counts. Filtering on such a criterion can bias the p-values kept, and ranking by the two Groups' combined count would avoid it. On simulated graphs, ranking per Group kept false findings at or under 5% and found more of the edges that really differed, so it stays.

**Benjamini-Hochberg is assumed to hold.** Tests at one activity or around one edge share cases; edges leaving one activity compete for them. Benjamini-Hochberg's guarantee covers independent and positively dependent tests; Benjamini-Yekutieli covers any dependence at a cost of roughly the logarithm of the family's size, and was not taken. The A/A splits stayed near 5%.

A permutation test was rejected: it needs a generator, seeds and a draw budget for places that were uncommon on the logs measured. Repetitions compare shares, because Mann-Whitney's normal approximation on near-total ties gave p-values thousands of times too small.

Case-level attributes keep the DRT's methods, because the case strip the two views share labels every test through `testLine`. `Test.test` reads `chi2` on a Fisher result, and `PlaceBlock.method` says how the p-value was computed.

Left to the analysis rules the whole app shares: one family per attribute rather than one for the whole graph, a minimum effect to call a difference, and testing a place only one Group reaches.
