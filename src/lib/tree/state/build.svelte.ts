import { directedTree } from "$lib/tree/invokers/directed-tree";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
import { comparedGroups } from "$lib/groups/state/comparison.svelte";
import {
  resetBuildView,
  resetTreeState,
  saveSettings,
  settings
} from "$lib/tree/state/tree.svelte";
import type { Project } from "$lib/event-log/types";
import type { TreeSettings } from "$lib/tree/types";
import { groupKey, treeKey, treeKeyFromGroupKeys } from "$lib/tree/utils/settings";
import { sameSelection } from "$lib/tree/utils/variants";

export const built = $state<{
  projectId: string | null;
  key: string | null;
  tree: ResponseDirectedTree | null;
  building: boolean;
  error: string | null;
}>({ projectId: null, key: null, tree: null, building: false, error: null });

interface BuildRequest {
  key: string;
  groupKeys: string[];
  groupIds: string[];
  settings: TreeSettings;
}

let generation = 0;
let failedKey: string | null = null;

function snapshot(): BuildRequest {
  const groups = comparedGroups();
  const value = settings.value;
  const buildSettings = {
    attributes: [...value.attributes],
    selectedVariants: [...value.selectedVariants],
    attributesChosen: value.attributesChosen
  };
  const groupKeys = groups.map(groupKey);
  return {
    key: treeKeyFromGroupKeys(groupKeys, buildSettings),
    groupKeys,
    groupIds: groups.map((group) => group.id),
    settings: buildSettings
  };
}

function matchesCurrentKey(key: string): boolean {
  return treeKey(comparedGroups(), settings.value) === key;
}

function includedVariants(tree: ResponseDirectedTree, request: BuildRequest): TreeSettings {
  return {
    ...request.settings,
    selectedVariants: tree.nodes
      .map((node) => node.variantKey)
      .filter((key): key is string => key !== null)
  };
}

export function isStale(): boolean {
  return built.tree !== null && built.key !== treeKey(comparedGroups(), settings.value);
}

export async function build(project: Project) {
  const mine = ++generation;
  const request = snapshot();
  built.projectId = project.id;
  built.building = true;
  built.error = null;
  failedKey = null;
  try {
    const tree = await directedTree(project, request.groupIds, request.settings);
    if (mine !== generation || !matchesCurrentKey(request.key)) return;

    const adoptedSettings = includedVariants(tree, request);
    const adoptedKey = treeKeyFromGroupKeys(request.groupKeys, adoptedSettings);
    if (!sameSelection(adoptedSettings.selectedVariants, request.settings.selectedVariants)) {
      await saveSettings(project.id, adoptedSettings);
    }
    if (mine !== generation || !matchesCurrentKey(adoptedKey)) return;

    built.projectId = project.id;
    built.tree = tree;
    resetBuildView();
    built.key = adoptedKey;
  } catch (cause) {
    if (mine !== generation) return;
    built.error = String(cause);
    failedKey = request.key;
  } finally {
    if (mine === generation) built.building = false;
  }
}

export function autoBuild(project: Project) {
  if (built.building || (built.tree === null && built.projectId === null)) return;
  const key = treeKey(comparedGroups(), settings.value);
  if (built.key === key || failedKey === key) return;
  void build(project);
}

export function retryBuild(project: Project) {
  failedKey = null;
  void build(project);
}

function clear() {
  generation += 1;
  failedKey = null;
  built.projectId = null;
  built.key = null;
  built.tree = null;
  built.building = false;
  built.error = null;
  resetTreeState();
}

export function forgetOtherProject(projectId: string) {
  if (built.projectId && built.projectId !== projectId) clear();
}

export function invalidateTree() {
  clear();
}
