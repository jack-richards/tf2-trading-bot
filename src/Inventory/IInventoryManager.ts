import { Inventory, Item } from "@tf2-automatic/bot-data"
import { tradeItem } from "../Trading/types/tradeItem"
import { EconItem } from "tf2-item-format/."
import { MappedItems } from "./types/mappedItems"

export interface IInventoryManager {
    // isAtStockLimit(sku: string): Promise<Boolean>
    getBotInventory(fetch?: boolean): Promise<Inventory>
    updateBotInventory(): Promise<void>
    getUserInventory(steamid: string): Promise<Inventory>
    checkStock(itemsToReceive: tradeItem[]): Promise<Boolean>
    mapItemsToObjects(itemsToGiveOrReceieve: EconItem[] | Item[]): MappedItems
    addInUseAssetID(assetID: string): void
    addInUseAssetIDs(assetIDs: string[]): void
    assetIDInUse(assetID: string): void
    removeAssetIDFromUse(assetID: string): void
    removeAssetIDsFromUse(assetIDs: string[]): void
    getAssetIDsInUse(): Set<string>
    getAvailableKeys(inventory?: Inventory): Promise<string[]>
}