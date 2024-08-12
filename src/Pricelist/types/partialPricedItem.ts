import Currencies from "@tf2autobot/tf2-currencies";

export type PartialPricedItem = {
    name: string;
    sku: string;
    purchase_price: Currencies
    time: number;
}