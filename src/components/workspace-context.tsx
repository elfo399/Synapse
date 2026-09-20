"use client";

import { createContext, useContext } from "react";
import type { ItemType } from "@/features/items/types";

export interface WorkspaceActions {
  name: string;
  capture: (type?: ItemType, inbox?: boolean) => void;
  search: () => void;
  notify: (message: string) => void;
}
export const WorkspaceContext = createContext<WorkspaceActions | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace components need a workspace provider");
  return value;
}
