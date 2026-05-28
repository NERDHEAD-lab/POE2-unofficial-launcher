import { describe, expect, it } from "vitest";

import { buildSidebarMenuActionDescriptors } from "./sidebarMenuActions";

describe("sidebarMenuActions", () => {
  it("keeps file action order and assigns distinct edit icons", () => {
    const actions = buildSidebarMenuActionDescriptors("file", false);

    expect(actions.map((action) => action.action)).toEqual([
      "copy",
      "cut",
      "rename",
      "delete",
    ]);
    expect(actions.map((action) => action.icon)).toEqual([
      "copy",
      "cut",
      "rename",
      "delete",
    ]);
  });

  it("adds paste only for folder menus when clipboard has an item", () => {
    expect(
      buildSidebarMenuActionDescriptors("folder", false).map(
        (action) => action.action,
      ),
    ).toEqual(["newFolder", "rename", "delete"]);
    expect(
      buildSidebarMenuActionDescriptors("folder", true).map(
        (action) => action.action,
      ),
    ).toEqual(["newFolder", "paste", "rename", "delete"]);
  });

  it("marks only delete as dangerous", () => {
    expect(
      buildSidebarMenuActionDescriptors("file", false).filter(
        (action) => action.danger,
      ),
    ).toEqual([
      { action: "delete", icon: "delete", shortcut: "D", danger: true },
    ]);
  });
});
