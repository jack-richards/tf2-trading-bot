import { TradeOffer } from "@tf2-automatic/bot-data";
import { IInventoryManager } from "../Inventory/IInventoryManager";

export class OfferQueueManager {
    private queue: TradeOffer[] = [];
    private processedOffers: Set<string> = new Set();
    private isProcessing: boolean = false;

    private inventoryManager: IInventoryManager;
    private tradeCompletionPromises: { [tradeID: string]: { resolve: () => void, reject: () => void } } = {};

    constructor(private handleReceivedTrade: (offer: TradeOffer) => Promise<void>, inventoryManager: IInventoryManager) {
        this.inventoryManager = inventoryManager;
    }

    async enqueueOffer(offer: TradeOffer) {
        if (!this.processedOffers.has(offer.tradeID)) {
            // Mark involved items as in-use.
            const assetIDs = offer.itemsToGive.map(item => item.assetid);
            this.inventoryManager.addInUseAssetIDs(assetIDs);

            this.queue.push(offer);
            this.processedOffers.add(offer.tradeID);
            this.processQueue();
        }
    }

    private async processQueue() {
        if (this.isProcessing) return; // Ensure only one process runs at a time

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const offer = this.queue.shift();
            if (offer) {
                let id = null;

                if (offer.tradeID) {
                    id = offer.tradeID;
                } else {
                    id = offer.id;
                }

                const assetIDs = offer.itemsToGive.map(item => item.assetid);

                try {
                    this.initializeTradeCompletionPromise(id);
                    await this.handleReceivedTrade(offer);
                    await this.waitForTradeCompletion(id);
                } catch (err) {
                    console.error('Error processing offer:', err);
                } finally {
                    this.inventoryManager.removeAssetIDsFromUse(assetIDs);
                }
            }
        }

        this.isProcessing = false;
    }

    private initializeTradeCompletionPromise(tradeID: string): void {
        this.tradeCompletionPromises[tradeID] = {
            resolve: () => {},
            reject: () => {},
        };
    }

    private waitForTradeCompletion(tradeID: string): Promise<void> {
        return new Promise((resolve) => {
            this.tradeCompletionPromises[tradeID] = { resolve, reject: () => {} };
        });
    }

    public markTradeAsComplete(tradeID: string) {
        const promise = this.tradeCompletionPromises[tradeID];
        if (promise) {
            promise.resolve();
            delete this.tradeCompletionPromises[tradeID];
        }
    }
}

export default OfferQueueManager;