export const DEFAULT_PLANNER_CATEGORIES = [
  { legacy: "WORK", name: "Lavoro", color: "#8FA9FF", icon: "briefcase", sortOrder: 0 },
  { legacy: "STUDY", name: "Studio", color: "#B59BE8", icon: "book-open", sortOrder: 1 },
  { legacy: "TRAINING", name: "Allenamento", color: "#8DCAA5", icon: "dumbbell", sortOrder: 2 },
  { legacy: "BREAK", name: "Pausa", color: "#D8BA78", icon: "coffee", sortOrder: 3 },
  { legacy: "PERSONAL", name: "Personale", color: "#E09AB9", icon: "heart", sortOrder: 4 },
  { legacy: "OTHER", name: "Altro", color: "#9DA5B2", icon: "circle", sortOrder: 5 },
] as const;

export type LegacyPlannerCategory = (typeof DEFAULT_PLANNER_CATEGORIES)[number]["legacy"];

export function defaultPlannerCategory(legacy: string) {
  return DEFAULT_PLANNER_CATEGORIES.find((category) => category.legacy === legacy) ?? DEFAULT_PLANNER_CATEGORIES[5];
}
