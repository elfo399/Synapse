export function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function normalizeTag(value: string): string {
  return normalizeIdentity(value).replace(/^#+/, "");
}
