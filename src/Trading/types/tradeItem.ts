import Currencies from "@tf2autobot/tf2-currencies"

export type tradeItem = {
    assetid: string,
    name: string,
    sku: string,
    buy: Currencies
    sell: Currencies
}