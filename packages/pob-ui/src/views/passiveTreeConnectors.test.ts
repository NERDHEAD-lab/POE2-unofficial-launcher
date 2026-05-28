import { describe, expect, it } from "vitest";

import {
  buildConnectorMap,
  connectorAssetName,
  connectorKey,
  connectorTextureQuad,
  projectConnectorQuad,
} from "./passiveTreeConnectors";

describe("passiveTreeConnectors", () => {
  it("indexes connectors by sorted node ids and preserves PoB art prefixes", () => {
    const connectors = buildConnectorMap([
      {
        type: "Orbit3",
        connectionArt: "CharacterPlanned",
        ascendancyName: "Stormweaver",
        nodeId1: 42,
        nodeId2: 7,
      },
    ]);
    const connector = connectors.get(connectorKey(7, 42))?.[0];

    expect(connector).toMatchObject({
      type: "Orbit3",
      connectionArt: "CharacterPlanned",
      ascendancyName: "Stormweaver",
      nodeId1: 42,
      nodeId2: 7,
    });
    expect(connector && connectorAssetName(connector, "Active")).toBe(
      "CharacterPlannedOrbit3Active",
    );
  });

  it("projects PoB quad vertices from tree-space to screen-space", () => {
    const connector = buildConnectorMap([
      {
        type: "LineConnector",
        connectionArt: "Character",
        nodeId1: 1,
        nodeId2: 2,
        vert: {
          Normal: [0, 10, 20, 30, 40, 50, 60, 70],
        },
      },
    ]).get("1_2")?.[0];

    expect(
      connector &&
        projectConnectorQuad(connector, "Active", {
          scale: 2,
          offsetX: 100,
          offsetY: -10,
        }),
    ).toEqual([100, 10, 140, 50, 180, 90, 220, 130]);
  });

  it("reads PoB Lua one-based quad records and texture coordinates", () => {
    const connector = buildConnectorMap({
      "2_3": {
        type: "Orbit1",
        connectionArt: "CharacterAscendancy",
        nodeId1: 2,
        nodeId2: 3,
        vert: {
          Active: {
            "1": 1,
            "2": 2,
            "3": 3,
            "4": 4,
            "5": 5,
            "6": 6,
            "7": 7,
            "8": 8,
          },
        },
        tex: {
          "1": 1,
          "2": 1,
          "3": 0,
          "4": 0.5,
          "5": 0,
          "6": 0,
          "7": 0.5,
          "8": 0,
        },
      },
    }).get("2_3")?.[0];

    expect(
      connector &&
        projectConnectorQuad(connector, "Active", {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
        }),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(connector && connectorTextureQuad(connector)).toEqual([
      1, 1, 0, 0.5, 0, 0, 0.5, 0,
    ]);
  });

  it("keeps duplicate PoB connectors for split arcs on the same node pair", () => {
    const connectors = buildConnectorMap([
      { type: "Orbit9", connectionArt: "Character", nodeId1: 1, nodeId2: 2 },
      { type: "Orbit9", connectionArt: "Character", nodeId1: 2, nodeId2: 1 },
    ]);

    expect(connectors.get("1_2")).toHaveLength(2);
  });

  it("clamps repeated straight-line texture coordinates to stretch in canvas", () => {
    const connector = buildConnectorMap([
      {
        type: "LineConnector",
        connectionArt: "Character",
        nodeId1: 1,
        nodeId2: 2,
        tex: [0, 1, 0, 0, 4, 0, 4, 1],
      },
    ]).get("1_2")?.[0];

    expect(connector && connectorTextureQuad(connector)).toEqual([
      0, 1, 0, 0, 1, 0, 1, 1,
    ]);
  });
});
