import { inventoryItem } from "../Inventory/types/inventoryItem"
import { tradeItem } from "../Trading/types/tradeItem"

export interface IPartialPricing {
    waitForReady(): Promise<void>
    recordPurchase(items: tradeItem[]): Promise<void>
    removePurchase(items: inventoryItem[]): Promise<void>
    // findPartialPricedItem(item: tradeItem['sku']): Promise<PartialPricedItem | null>
    applyPartialPricingAdjustments(items: tradeItem[], keyRate: number): Promise<tradeItem[]>
}