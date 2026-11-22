# DFG activities show how their count splits between Groups, and Activity Frequency is gone

**Status:** Accepted. Drops Activity Frequency from [ADR 0024](0024-the-dfg-tests-per-case.md).

An activity used to darken with its count, against every activity on screen, and the share of each Group's cases reaching it could be tested as Activity Frequency. Every activity is now drawn in the same light tint, the one of its Group when only one Group reaches it, and carries a bar splitting its count between the Groups, as the tree's nodes do.

**The bar splits the count as counted by default.** 900 cases of one Group and 100 of the other draw 90 and 10. The Display panel can turn it off, or adjust it per Group size: each Group's count is divided by the cases it holds before splitting, so a Group ten times larger does not fill the bar for its size alone. The bar follows the Count the edges are thickened by. One Group on screen, the comparison off or a split panel, draws no bar, since it would always be full.

A bar per Group, filled to the share of its cases reaching the activity, was tried first. On a real log most activities reach a few percent of the cases, so most bars drew as a dot and said nothing a reader could use.

**Activity Frequency tested a figure the graph already prints.** "% of group" puts the same share on every activity, so the test only added a p-value, and on logs of a hundred thousand cases a gap of one or two points is significant everywhere and negligible everywhere. It filled the tests panel with differences nobody could act on. Edge Frequency stays: which way the cases leave an activity is not on the face of any node.
