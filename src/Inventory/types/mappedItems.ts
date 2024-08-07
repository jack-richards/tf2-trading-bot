import { inventoryItem } from "./inventoryItem";

export type MappedItems = {
    currenciesMap: [string, string[]][];
    itemsArray: inventoryItem[];
}