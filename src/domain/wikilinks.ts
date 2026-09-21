import { normalizeIdentity } from "./normalization";

export interface WikiLink {
  title: string;
  normalized: string;
  alias?: string;
}

// Visit only prose: fenced and inline code examples never create knowledge edges.
export function mapWikiLinks(
  content: string,
  transform: (link: WikiLink, raw: string) => string,
): string {
  let fence: string | null = null;
  return content
    .split(/(\r?\n)/)
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length)
          fence = null;
        return line;
      }
      if (fence) return line;
      return line
        .split(/(`+[^`]*`+)/g)
        .map((part) => {
          if (part.startsWith("`")) return part;
          return part.replace(
            /(?<!\\)\[\[([^\[\]\n]+)\]\]/g,
            (raw: string, inner: string) => {
              const [target, ...aliasParts] = inner.split("|");
              const title = target.trim();
              if (!title || title.length > 200) return raw;
              return transform(
                {
                  title,
                  normalized: normalizeIdentity(title),
                  alias: aliasParts.length
                    ? aliasParts.join("|").trim()
                    : undefined,
                },
                raw,
              );
            },
          );
        })
        .join("");
    })
    .join("");
}

export function extractWikiLinks(content: string): WikiLink[] {
  const links = new Map<string, WikiLink>();
  mapWikiLinks(content, (link, raw) => {
    links.set(link.normalized, link);
    return raw;
  });
  return [...links.values()];
}

export function renameWikiLinks(
  content: string,
  oldNormalized: string,
  newTitle: string,
): string {
  return mapWikiLinks(content, (link, raw) =>
    link.normalized === oldNormalized
      ? `[[${newTitle}${link.alias ? `|${link.alias}` : ""}]]`
      : raw,
  );
}
