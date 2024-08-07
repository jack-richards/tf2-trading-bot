import { inventoryItem } from "../Inventory/types/inventoryItem"
import { tradeItem } from "../Trading/types/tradeItem"
import { Item } from "./types/item"
import { KeyPrice } from "./types/keyPrice"

export interface IPricelist {
    getItemPrice(sku: string): Promise<Item>
    getKeyPrice(): Promise<KeyPrice>
    getAllItems(): Promise<Item[]>
    checkItemPrices(items: inventoryItem[]): Promise<{ allPriced: boolean; items: tradeItem[] }>
}