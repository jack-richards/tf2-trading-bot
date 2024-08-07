import Currencies from "@tf2autobot/tf2-currencies";

export type Item = {
    name: string;
    sku: string;
    source?: string;
    buy: Currencies
    sell: Currencies
    time: number;
};