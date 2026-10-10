# Saved Comparisons sit beside the Comparison, and "in use" is derived

Switching what the tree and the DFG compare meant opening a modal and picking both Groups again, every time. A project with four Groups has a handful of pairs worth looking at, and the reader moves between them constantly. The Compare field now opens a popover with those pairs kept in a list on the left and an editor over the selected one on the right, so a pair is chosen once and reached in one click afterwards.

**The `comparisons` table stays the only thing the views read.** A Saved Comparison is a row in a new `saved_comparisons` table: an id, the project, an ordered list of one or two Group ids, and a creation time that orders the list. `comparedGroups()` and `comparedIds()` are unchanged and never look at it. Comparing a Saved Comparison copies its ids into `comparisons` through `saveComparison`, the same write the modal made.

**Which Saved Comparison is in use is derived, never stored.** It is the one whose Group ids equal the ids being compared, in the same order. An active-id column was rejected because it is a second answer to "what is compared" that can disagree with the first: the Sample Project, the seed script and a Difference Group all write `comparisons` directly, and each would have had to keep the pointer honest. Matching ids cannot go stale, and a comparison nobody saved is simply one no row matches. The match is against `comparedIds()`, what the views draw, so a stored selection naming a deleted Group does not hide the row that is really on screen. Order counts because it is what the views draw first; the same two Groups swapped are another Saved Comparison.

**Deleting a Saved Comparison does not change what is compared.** It removes the row and nothing else. The views keep drawing the same Groups, which now match no row, and the popover shows them as a new draft. Deleting is housekeeping on a list; making it also switch the canvas would turn a small cleanup into a rebuild of the tree the reader was looking at.

**No two rows hold the same ids.** Saving a draft that equals an existing Saved Comparison compares that one and writes nothing, whether the draft was new or an edit of another row.

**A deleted Group takes its Saved Comparisons with it.** `removeGroup` deletes the rows naming the Group or anything deleted with it, and deleting a Project deletes all of its rows. A Group that is merely un-applied keeps its rows; the popover leaves them out until it is applied again, the same rule `comparedGroups()` uses. The store, `groups/state/saved-comparisons.svelte.ts`, reads only the database, so `groups.svelte.ts` can call it while `comparison.svelte.ts` keeps importing `groups.svelte.ts` and not the reverse.

**Consequence:** nothing records when a Saved Comparison was last compared, so the list is in creation order and cannot be sorted by recency. A Saved Comparison has no name; it reads as its Groups' names and follows a rename for free.
