import { directedTree } from "$lib/tree/invokers/directed-tree";
import { treeOutliers } from "$lib/tree/invokers/tree-outliers";
import type { OutlierLoad } from "$lib/analysis/types";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
import {
  comparedGroups,
  comparison,
  comparisonKey,
  relationReady
} from "$lib/groups/state/comparison.svelte";
import { groupsLoaded } from "$lib/groups/state/groups.svelte";
import {
  resetBuildView,
  resetTreeState,
  saveSettings,
  selectedVariants,
  settings,
  view
} from "$lib/tree/state/tree.svelte";
import type { Project } from "$lib/event-log/types";
import type { TreeSettings } from "$lib/tree/types";
import { treeKey } from "$lib/tree/utils/settings";
import { sameSelection } from "$lib/tree/utils/variants";
import { nodeTarget, visibleNodes } from "$lib/tree/utils/tree";

export const built = $state<{
  projectId: string | null;
  key: string | null;
  tree: ResponseDirectedTree | null;
  building: boolean;
  error: string | null;
}>({ projectId: null, key: null, tree: null, building: false, error: null });

interface BuildRequest {
  key: string;
  comparisonKey: string;
  groupIds: string[];
  settings: TreeSettings;
}

/** The Project and Group ids the tree on screen was built from. */
let source: { project: Project; groups: string[] } | null = null;

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
  const compared = comparisonKey();
  return {
    key: treeKey(compared, buildSettings),
    comparisonKey: compared,
    groupIds: groups.map((group) => group.id),
    settings: buildSettings
  };
}

function matchesCurrentKey(key: string): boolean {
  return treeKey(comparisonKey(), settings.value) === key;
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
  return built.tree !== null && built.key !== treeKey(comparisonKey(), settings.value);
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
    const adoptedKey = treeKey(request.comparisonKey, adoptedSettings);
    if (!sameSelection(adoptedSettings.selectedVariants, request.settings.selectedVariants)) {
      await saveSettings(project.id, adoptedSettings);
    }
    if (mine !== generation || !matchesCurrentKey(adoptedKey)) return;

    built.projectId = project.id;
    built.tree = tree;
    resetBuildView();
    built.key = adoptedKey;
    source = { project, groups: request.groupIds };
  } catch (cause) {
    if (mine !== generation) return;
    built.error = String(cause);
    failedKey = request.key;
  } finally {
    if (mine === generation) built.building = false;
  }
}

/**
 * Whether every persisted input the tree key is made of has arrived for this
 * project. Building on the defaults that stand before they load produces a tree
 * the loaded selection then filters down to its root.
 */
export function inputsReady(projectId: string): boolean {
  return (
    groupsLoaded.projectId === projectId &&
    settings.projectId === projectId &&
    comparison.projectId === projectId &&
    relationReady()
  );
}

/**
 * Rebuilds when an input the tree is made of has changed. The first tree of a
 * project is the attribute prompt's to ask for and to build: until it is
 * answered, `attributesChosen` is false and nothing here fires.
 */
export function autoBuild(project: Project) {
  if (built.building || !inputsReady(project.id)) return;
  if (!settings.value.attributesChosen) return;
  const key = treeKey(comparisonKey(), settings.value);
  if (built.key === key || failedKey === key) return;
  void build(project);
}

export function retryBuild(project: Project) {
  failedKey = null;
  void build(project);
}

function clear() {
  generation += 1;
  source = null;
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

/** Fetches the outliers of one node's attribute, `undefined` while no current tree is on screen. */
export function nodeOutliers(nodeId: number, attribute: string): OutlierLoad | undefined {
  const tree = built.tree;
  if (!source || !tree || isStale()) return undefined;
  const { project, groups } = source;
  const visible = visibleNodes(tree, view, selectedVariants());
  const target = nodeTarget(tree, visible, nodeId, "atStep", attribute, false);
  return () => treeOutliers(project, groups, target);
}

/** Fetches the outliers of one case-level attribute, `undefined` while no current tree is on screen. */
export function caseOutliers(attribute: string): OutlierLoad | undefined {
  if (!source || !built.tree || isStale()) return undefined;
  const { project, groups } = source;
  return () => treeOutliers(project, groups, { kind: "case", attribute });
}
