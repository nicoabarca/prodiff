# The DFG tests one observation per case, and owns how

A case passes through a tree node once and can visit a DFG activity many times, so the DRT's tests cannot run on a DFG place unchanged. Every DFG test treats a case as one observation: a numeric value is its mean over the case's runs, a categorical value counts every case that ever held it, and frequency and repetition tests compare shares of cases. The method is chosen in `dfg/significance.rs`, and `analysis`, `tree` and `statistics` stay untouched.

Chi-square decides only when each case falls in one category and Cochran's rule holds. A two-by-two that fails Cochran's rule takes Fisher's p-value. A categorical attribute with several values per case, or that fails Cochran's rule, tests each value as a two-by-two, and its p-value is the smallest times the number of values. A permutation test was rejected: it needs a generator, seeds and a draw budget for places that were uncommon on the logs measured. Repetitions compare the share of cases running an activity more than once, because Mann-Whitney's normal approximation on near-total ties gave p-values thousands of times too small. Edge Frequency divides by the cases reaching the source, so it tests the routing decision at that step.

Case-level attributes keep the DRT's methods, because the case strip the two views share labels every test through `testLine`. `Test.test` therefore reads `chi2` on a Fisher or per-value result, and `PlaceBlock.method` says how the p-value was computed.

The cost is that the per-value test can miss a small difference spread across many values, "ever had" rises with the number of visits, and the shared bars split mentions at a place where a case held several values. A note on the card says so.
