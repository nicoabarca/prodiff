import type { ResponseDfg } from "$lib/dfg/invokers/types";
import type { FaceGroup } from "$lib/dfg/types";
import { groups, originalGroup } from "$lib/groups/state/groups.svelte";

export function graphGroups(graph: ResponseDfg, projectId: string): FaceGroup[] {
  const known = new Map([...groups, originalGroup(projectId)].map((group) => [group.id, group]));
  return graph.groups.map((group) => {
    const current = known.get(group.id);
    return {
      id: group.id,
      name: current?.name ?? group.id,
      color: current?.color ?? "group-original"
    };
  });
}
