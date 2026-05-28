import type { SidebarItemRef } from "./folderTree";

export type SidebarMenuAction =
  | "newFolder"
  | "paste"
  | "copy"
  | "cut"
  | "rename"
  | "delete";

export type SidebarMenuIcon =
  | "new-folder"
  | "paste"
  | "copy"
  | "cut"
  | "rename"
  | "delete";

export interface SidebarMenuActionDescriptor {
  action: SidebarMenuAction;
  icon: SidebarMenuIcon;
  shortcut: string;
  danger?: boolean;
}

export const buildSidebarMenuActionDescriptors = (
  itemKind: SidebarItemRef["kind"],
  hasClipboard: boolean,
): SidebarMenuActionDescriptor[] => {
  const shared: SidebarMenuActionDescriptor[] = [
    { action: "rename", icon: "rename", shortcut: "R" },
    { action: "delete", icon: "delete", shortcut: "D", danger: true },
  ];

  if (itemKind === "folder") {
    return [
      { action: "newFolder", icon: "new-folder", shortcut: "N" },
      ...(hasClipboard
        ? [{ action: "paste", icon: "paste", shortcut: "P" } as const]
        : []),
      ...shared,
    ];
  }

  return [
    { action: "copy", icon: "copy", shortcut: "C" },
    { action: "cut", icon: "cut", shortcut: "X" },
    ...shared,
  ];
};
