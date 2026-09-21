export function getItemHref(item: { id: string; title: string }): string {
  const slug =
    item.title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "elemento";
  return `/items/${slug}--${encodeURIComponent(item.id)}`;
}

export function getItemId(segment: string): string {
  return segment.includes("--")
    ? segment.slice(segment.lastIndexOf("--") + 2)
    : segment;
}
