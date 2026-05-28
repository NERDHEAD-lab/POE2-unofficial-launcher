import { describe, expect, it } from "vitest";

import type { PobTreeNode } from "@poe2-launcher/shared/types";

import {
  buildTreePathPreview,
  getTreeConnectorVisualState,
  getTreeNodeVisualState,
  isTreeDependencyConnector,
} from "./passiveTreePreview";

const node = (overrides: Partial<PobTreeNode>): PobTreeNode => ({
  id: 1,
  x: 0,
  y: 0,
  name: "Test",
  type: "Normal",
  ascendancyName: null,
  isAscendancyStart: false,
  isKeystone: false,
  isNotable: false,
  isSocket: false,
  isMastery: false,
  isOnlyImage: false,
  alloc: false,
  linked: [],
  ...overrides,
});

describe("passiveTreePreview", () => {
  it("builds PoB hover path and dependency id sets", () => {
    const preview = buildTreePathPreview(
      node({ id: 10, path: [1, 2, 2, 10], depends: [3, 4, 4] }),
    );

    expect(preview.hoveredNodeId).toBe(10);
    expect([...preview.pathNodeIds]).toEqual([1, 2, 10]);
    expect([...preview.dependencyNodeIds]).toEqual([3, 4]);
  });

  it("resolves node visual states from hover path before allocation", () => {
    const preview = buildTreePathPreview(node({ id: 3, path: [1, 2, 3] }));

    expect(getTreeNodeVisualState(node({ id: 3 }), preview)).toBe("alloc");
    expect(getTreeNodeVisualState(node({ id: 2 }), preview)).toBe("path");
    expect(getTreeNodeVisualState(node({ id: 4, alloc: true }), preview)).toBe(
      "alloc",
    );
    expect(getTreeNodeVisualState(node({ id: 5 }), preview)).toBe("unalloc");
  });

  it("matches PoB connector preview states for active and hover paths", () => {
    const preview = buildTreePathPreview(node({ id: 3, path: [1, 2, 3] }));

    expect(
      getTreeConnectorVisualState(
        node({ id: 1, alloc: true }),
        node({ id: 2, alloc: true }),
        preview,
      ),
    ).toBe("Active");
    expect(
      getTreeConnectorVisualState(
        node({ id: 1, alloc: true }),
        node({ id: 2, alloc: false }),
        preview,
      ),
    ).toBe("Intermediate");
    expect(
      getTreeConnectorVisualState(
        node({ id: 4, alloc: false }),
        node({ id: 5, alloc: false }),
        preview,
      ),
    ).toBe("Normal");
  });

  it("marks dependency connectors for deallocation preview", () => {
    const preview = buildTreePathPreview(node({ id: 1, depends: [2, 3] }));

    expect(
      isTreeDependencyConnector(node({ id: 2 }), node({ id: 3 }), preview),
    ).toBe(true);
    expect(
      isTreeDependencyConnector(node({ id: 2 }), node({ id: 4 }), preview),
    ).toBe(false);
  });
});
