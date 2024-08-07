import { tradeItem } from "./tradeItem";

export type ItemsToGiveOrReceive = {
    currenciesMap: [string, string[]][];
    itemsArray: tradeItem[];
};