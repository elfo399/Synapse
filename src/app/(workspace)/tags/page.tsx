import { TagsPage } from "@/features/tags/tags-page";
import { ItemList } from "@/features/items/item-list";
export default async function Page({ searchParams }: { searchParams: Promise<{ tag?: string }> }) { const { tag } = await searchParams; return tag ? <ItemList key={tag} kind="tagged items" tag={tag} /> : <TagsPage />; }
