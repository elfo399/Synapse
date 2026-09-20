import { ItemDetail } from "@/features/items/item-detail";
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ItemDetail id={id} />; }
