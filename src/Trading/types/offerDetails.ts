import { EconItem } from "tf2-item-format/."

export type OfferDetails = {
    status: Number,
    tradeInitTime: Number,
    receivedItems: EconItem[],
    sentItems: EconItem[]
}