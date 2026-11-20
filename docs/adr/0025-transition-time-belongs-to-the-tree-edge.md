# Transition Time belongs to the tree edge

**Status:** Accepted.

Transition Time is the time between the previous event and an activity. It describes the step between two activities, not one activity. The tree counted it with the node's own attributes: in the node's badge, in its Differences tabs and as a figure on the node face. A reader then saw a difference on an activity that was in fact on the way into that activity.

**The edge carries Transition Time.** A tree node has one parent. So the Transition Time that Rust ships on a node belongs to the edge into it. The payload does not change. The frontend reads `TreeNode.transitionTime` as the edge's and never as the node's.

**A significant difference marks the edge.** The edge label gets an `--effect` border, and a meter of four bars hangs from its top right corner, filled up to the effect step of its test (see `docs/adr/0026`). The meter has no count, because an edge holds one test. When labels are off, the meter sits at the middle of the edge. One-Group mode has no test and no mark.

**An edge is selected like a node.** Clicking an edge that carries Transition Time opens the detail panel on that edge: its header names both activities, and it holds the one Transition Time row with its verdict, effect and Box Plot. The edges leaving Start carry no Transition Time and cannot be selected. A node and an edge cannot both be selected, so the selection is one value that names either. Distributions opens only from a node.

**The node keeps only its own attributes.** Its badge count and colour, its Differences tabs and its figure leave Transition Time out.

**Consequences:** "Only variants with a finding" still keeps a Variant whose only finding is on an edge, because that edge is part of its path. Distributions still shows a Transition Time card for the node it opens on, titled with the activity the edge comes from.
