import { TradeOffer } from "@tf2-automatic/bot-data";

export class OfferQueueManager {
    private queue: TradeOffer[] = [];
    private isProcessing: boolean = false;
    private tradeStates: Map<string, 'Pending' | 'Processing' | 'Completed' | 'Error'> = new Map();

    constructor(private handleReceivedTrade: (offer: TradeOffer) => Promise<void>) {}

    public enqueueOffer(offer: TradeOffer) {
        const id = offer.id || offer.tradeID;
        if (!this.tradeStates.has(id)) {
            this.queue.push(offer);
            this.tradeStates.set(id, 'Pending');
            this.processQueue();
        }
    }

    private async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        const offer = this.queue.shift();
        const id = offer.id || offer.tradeID;

        if (offer) {
            this.tradeStates.set(id, 'Processing');
            try {
                await this.handleReceivedTrade(offer);
            } catch (e) {
                console.log(e);
                console.log("Error occurred while processing the trade.");
                // Remove the trade state on error. Could adjust this to earmark it with
                // error so the offer could be re-made or re-attempted. 
                this.tradeStates.delete(id);
                this.isProcessing = false;
                // Continue to the next trade after an error.
                this.processQueue();
            }
        } else {
            this.isProcessing = false;
        }
    }

    public markTradeAsComplete(tradeID: string) {
        this.tradeStates.set(tradeID, 'Completed');
        console.log("Marked as complete: " + tradeID);
        this.isProcessing = false;
        this.processQueue();
    }
}