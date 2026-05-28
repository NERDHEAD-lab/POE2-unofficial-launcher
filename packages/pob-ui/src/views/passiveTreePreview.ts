import type { PobTreeNode } from "@poe2-launcher/shared/types";

import type { NodeFrameVisualState } from "./passiveTreeAssets";
import type { TreeConnectorState } from "./passiveTreeConnectors";

export interface TreePathPreview {
  hoveredNodeId: number | null;
  pathNodeIds: Set<number>;
  dependencyNodeIds: Set<number>;
}

type PreviewSource = Pick<PobTreeNode, "id" | "path" | "depends">;

const toFiniteIdSet = (ids: number[] | undefined): Set<number> =>
  new Set(
    (ids ?? []).filter((id) => Number.isInteger(id) && Number.isFinite(id)),
  );

export const buildTreePathPreview = (
  hoveredNode: PreviewSource | null,
): TreePathPreview => ({
  hoveredNodeId: hoveredNode?.id ?? null,
  pathNodeIds: toFiniteIdSet(hoveredNode?.path),
  dependencyNodeIds: toFiniteIdSet(hoveredNode?.depends),
});

export const getTreeNodeVisualState = (
  node: Pick<PobTreeNode, "id" | "alloc">,
  preview: TreePathPreview,
): NodeFrameVisualState => {
  if (node.alloc || preview.hoveredNodeId === node.id) return "alloc";
  if (preview.pathNodeIds.has(node.id)) return "path";
  return "unalloc";
};

const isHoverPathEndpoint = (
  node: Pick<PobTreeNode, "id" | "alloc">,
  preview: TreePathPreview,
): boolean =>
  preview.hoveredNodeId === node.id ||
  preview.pathNodeIds.has(node.id) ||
  node.alloc;

export const getTreeConnectorVisualState = (
  node1: Pick<PobTreeNode, "id" | "alloc">,
  node2: Pick<PobTreeNode, "id" | "alloc">,
  preview: TreePathPreview,
): TreeConnectorState => {
  if (node1.alloc && node2.alloc) return "Active";

  if (
    preview.pathNodeIds.size > 0 &&
    isHoverPathEndpoint(node1, preview) &&
    isHoverPathEndpoint(node2, preview) &&
    (!node1.alloc ||
      !node2.alloc ||
      (preview.pathNodeIds.has(node1.id) && preview.pathNodeIds.has(node2.id)))
  ) {
    return "Intermediate";
  }

  return "Normal";
};

export const isTreeDependencyConnector = (
  node1: Pick<PobTreeNode, "id">,
  node2: Pick<PobTreeNode, "id">,
  preview: TreePathPreview,
): boolean =>
  preview.dependencyNodeIds.has(node1.id) &&
  preview.dependencyNodeIds.has(node2.id);
