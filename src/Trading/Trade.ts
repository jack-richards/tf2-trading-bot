import { IInventoryManager } from "../Inventory/IInventoryManager";
import { IPricelist } from "../Pricelist/IPricelist";
import { ConsumeMessage } from "amqplib";
import TF2Currencies from "@tf2autobot/tf2-currencies";
import { ItemsToGiveOrReceive } from "./types/itemsToGiveOrReceive";
import axios from "axios";
import { AutoKeys } from "../Inventory/AutoKeys/AutoKeys";
import { KeyPrice } from "../Pricelist/types/keyPrice";
import Currencies from "@tf2autobot/tf2-currencies";
import { MappedItems } from "../Inventory/types/mappedItems";
import { OfferQueueManager } from "./OfferQueueManager";
import { TradeOffer } from "@tf2-automatic/bot-data";

export class Trade {
    private inventory: IInventoryManager;
    private pricelist: IPricelist;
    private autokeys: AutoKeys

    private offerQueueManager: OfferQueueManager;

    constructor(inventory: IInventoryManager, pricelist: IPricelist, autokeys: AutoKeys) {
        this.inventory = inventory;
        this.pricelist = pricelist;
        this.autokeys = autokeys;

        this.offerQueueManager = new OfferQueueManager(this.handleRecievedTrade, this.inventory);
    }

    public handleTradeEvents = async (data: ConsumeMessage | null) => {
        if (!data) {
            return;
        }

        try {
            const message = JSON.parse(data.content.toString());
            const routingKey = data.fields.routingKey;

            switch (routingKey) {
                case 'trades.received':
                    // await this.handleRecievedTrade(message.data.offer);
                    await this.offerQueueManager.enqueueOffer(message.data.offer);
                    break;
                case 'trades.sent':
                    console.log(message);
                    break;
                case 'trades.confirmation_needed':
                    const id = message.data.offer.id;
                    await this.confirmOffer(id);
                    break;
                case 'trades_changed':
                    const offer = message.data.offer;
                    const offerState: TradeOffer['state'] = offer.state;

                    if (offerState && 
                        offerState === 1 || // Invalid.
                        offerState === 3 || // Accepted.
                        offerState === 5 || // Expired.
                        offerState === 6 || // Canceled.
                        offerState === 7 || // Declined.
                        offerState === 8 || // Invalid items.
                        offerState === 10 // Cancelled by two-factor.
                    ) {
                        this.offerQueueManager.markTradeAsComplete(offer.id);
                    }
                    break;
                default:
                    console.log(message);
                    throw new Error('Unrecognised event.');
            }
        } catch (err) {
            console.log('Failed to parse event', err);
        }
    }

    private confirmOffer = async (id: string) => {
        await axios.post(`http://localhost:3000/trades/${id}/confirm`);
        console.log("Confirmed offer: " + id);
    }

    private async calculateValue(itemsToGiveOrReceive: ItemsToGiveOrReceive, toGive: Boolean, keyRate: number) {    
        // Convert the array back to a Map
        const currenciesMap = new Map<string, string[]>(itemsToGiveOrReceive.currenciesMap);

        console.log(currenciesMap);

        let value = 0;

        let keys = (currenciesMap.get('Mann Co. Supply Crate Key')?.length || 0);
        console.log("Keys : " + keys);
    
        const refinedValue = (currenciesMap.get('Refined Metal')?.length || 0);
        const reclaimedValue = (currenciesMap.get('Reclaimed Metal')?.length || 0);
        const scrapValue = (currenciesMap.get('Scrap Metal')?.length || 0);
    
        // Calculate the value of pure currencies
        const keysValueInScrap = new Currencies({ metal: (keyRate * keys) }).toValue();
        
        value += keysValueInScrap;
        value += 9 * refinedValue;
        value += 3 * reclaimedValue;
        value += scrapValue;
    
        console.log("Initial Value from Pure: " + value);
    
        // Calculate the value of each of the priced items in the trade
        for (const item of itemsToGiveOrReceive.itemsArray) {
            if (toGive) {
                const sell = item.sell;
                if (sell) {
                    value += sell.toValue(keyRate);
                }
            } else {
                const buy = item.buy;
                if (buy) {
                    value += buy.toValue(keyRate);
                }
            }
        }

        console.log("To Give: " + toGive);
        console.log("Key Rate: " + keyRate);
        console.log("Value: " + value);

        const total = value;

        return total;
    }

    private shouldAcceptOffer = async (itemsToGive: ItemsToGiveOrReceive, itemsToReceive: ItemsToGiveOrReceive) => {
        const keyPriceObject: KeyPrice = await this.pricelist.getKeyPrice();

        let keysBothSides = false;
        // If no keys are involved just metal and a item we set the key rate to the buy price.
        let keyOurSide = false;
        let onlyMetal = false;
        // const itemsAndKeys = false; TODO.

        // Convert the array back to a Map
        const toGiveCurrenciesMap = new Map<string, string[]>(itemsToGive.currenciesMap);
        const toReceiveCurrenciesMap = new Map<string, string[]>(itemsToReceive.currenciesMap);

        keysBothSides = this.isKeysBothSides(toGiveCurrenciesMap, toReceiveCurrenciesMap);
        // Decline trade offers which include keys on both sides.
        if (keysBothSides) {
            return false;
        }

        onlyMetal = this.isOnlyMetal(itemsToGive, itemsToReceive, toGiveCurrenciesMap, toReceiveCurrenciesMap);
        // Decline trade offers involving only pure metal (no keys or items).
        if (onlyMetal) {
            return false;
        }

        // We already know at this point that both sides don't have a key at the same time.
        // However, we need to check to see if we have a key on our side as it will determine what key price we use in
        // our value conversion logic.
        keyOurSide = toGiveCurrenciesMap.get('Mann Co. Supply Crate Key')?.length > 0 || false;

        console.log("Key our side: " + keyOurSide);

        // If we have a key on our side we use the sell metal price, else buy metal.
        const keyRate = keyOurSide ? keyPriceObject.sell.metal : keyPriceObject.buy.metal;

        try {
            // Identify if trade is a key trade and what side we're on.
            const tradeType = this.isKeyTrade(itemsToGive, itemsToReceive, toGiveCurrenciesMap, toReceiveCurrenciesMap);
        
            if (tradeType === 'buy') {
                return this.autokeys.getIsBuyingKeys() && this.processKeyTrade('buy', toGiveCurrenciesMap, toReceiveCurrenciesMap, keyPriceObject);
            } else if (tradeType === 'sell') {
                return this.autokeys.getIsSellingKeys() && this.processKeyTrade('sell', toGiveCurrenciesMap, toReceiveCurrenciesMap, keyPriceObject);
            }
        } catch (e) {
            console.log(e);
            return false;
        }

        // Calculate value of both sides of trade.
        // Need to get buy/sell prices of items in trade.
        const toGiveValue = await this.calculateValue(itemsToGive, true, keyRate);
        const toReceiveValue = await this.calculateValue(itemsToReceive, false, keyRate);

        if (toReceiveValue < toGiveValue) {
            // Decline trade as we get less from it.
            return false;
        }

        try {
            // There may be a small risk that if the names do not match the stock check won't work properly.
            // Now check our stock limit, we do this at the end to ensure that we don't needlessly request the inventory if the trade was destined to be rejected.
            const isOverstocked = await this.inventory.checkStock(itemsToReceive.itemsArray);

            if (isOverstocked) {
                console.log("Overstocked");
                return false;
            }
        } catch (err) {
            console.error("Error checking stock, default is to cancel trade offer.");
            return false;
        }

        // Not overstocked on any of the items given in trade and value is in our favour.
        return true;
    }

    private isOnlyMetal = (itemsToGive: ItemsToGiveOrReceive, itemsToReceive: ItemsToGiveOrReceive, toGiveCurrencies: Map<string, string[]>, toReceiveCurrencies: Map<string, string[]>) => {
        return itemsToGive.itemsArray.length === 0 && itemsToReceive.itemsArray.length === 0 &&
            !toGiveCurrencies.has('Mann Co. Supply Crate Key') && !toReceiveCurrencies.has('Mann Co. Supply Crate Key');
    }

    private isKeysBothSides = (toGiveCurrencies: Map<string, string[]>, toReceiveCurrencies: Map<string, string[]>) => {
        return toGiveCurrencies.has('Mann Co. Supply Crate Key') && toReceiveCurrencies.has('Mann Co. Supply Crate Key');
    }

    private processKeyTrade = (intent: 'buy' | 'sell', toGiveCurrencies: Map<string, string[]>, toReceiveCurrencies: Map<string, string[]>, keyPrice: KeyPrice) => {
        const keyName = 'Mann Co. Supply Crate Key';
        if (intent === 'buy') {
            const keysToReceive = toReceiveCurrencies.get(keyName)?.length || 0;

            if (keysToReceive > this.autokeys.getKeysToBuy()) {
                // Buying too many keys.
                return false;
            }
        } else if (intent === 'sell') {
            const keysToGive = toGiveCurrencies.get(keyName)?.length || 0;

            if (keysToGive > this.autokeys.getKeysToSell()) {
                // Selling too many keys.
                return false;
            }
        }

        const theirValue = this.calculateCurrencyValue(toReceiveCurrencies, false, keyPrice);
        const ourValue = this.calculateCurrencyValue(toGiveCurrencies, true, keyPrice);

        return theirValue <= ourValue;
    }

    private calculateCurrencyValue(currenciesMap: Map<string, string[]>, toGive: boolean, keyPrice: KeyPrice) {        
        const keys = currenciesMap.get('Mann Co. Supply Crate Key')?.length || 0;
        const keyValue = toGive ? keyPrice.sell.metal * keys : keyPrice.buy.metal * keys;
    
        const refinedValue = currenciesMap.get('Refined Metal')?.length || 0;
        const reclaimedValue = (currenciesMap.get('Reclaimed Metal')?.length || 0) * 0.33;
        const scrapValue = (currenciesMap.get('Scrap Metal')?.length || 0) * 0.11;
        
        const metal = keyValue + refinedValue + reclaimedValue + scrapValue;
        const currencies = new TF2Currencies({ metal });
        
        return currencies.toValue();
    }

    private isKeyTrade(
        itemsToGive: ItemsToGiveOrReceive,
        itemsToReceive: ItemsToGiveOrReceive,
        toGiveCurrenciesMap: Map<string, string[]>,
        toReceiveCurrenciesMap: Map<string, string[]>
    ): 'sell' | 'buy' | 'none' {
        const keyName = 'Mann Co. Supply Crate Key';
    
        if (itemsToGive.itemsArray.length === 0 && itemsToReceive.itemsArray.length === 0) {
            if (toGiveCurrenciesMap.has(keyName) && !toReceiveCurrenciesMap.has(keyName)) {
                return 'sell';
            } else if (!toGiveCurrenciesMap.has(keyName) && toReceiveCurrenciesMap.has(keyName)) {
                return 'buy';
            } else {
                throw new Error('Offer contains no items and only pure, with keys on both sides of the trade.');
            }
        }
        return 'none';
    }

    private acceptTrade = async (tradeID: string) => {
        await axios.post(`http://localhost:3000/trades/${tradeID}/accept`);
        console.log("Accepted trade: " + tradeID);
    }

    private declineTrade = async (tradeID: string) => {
        await axios.delete(`http://localhost:3000/trades/${tradeID}`);
        console.log("Declined trade: " + tradeID);
    }

    private checkEscrow = async (offer?: TradeOffer, steamID?: string, token?: string): Promise<boolean> => {
        try {
            if (offer) {
                if (offer.escrowEndsAt === null) {
                    // Trade details state that offer won't have escrow.
                    return false;
                } else {
                    // Trade details state that offer will have escrow.
                    return true;
                }
            } else if (steamID && token) {
                const response = await axios.get(`http://localhost:3000/escrow/${steamID}/${token}`);
                return response.data.escrowDays > 0;
            } else {
                throw new Error('Missing parameters needed to check escrow.');
            }
        } catch (error) {
            console.error('Error checking escrow:', error);
            throw new Error('Failed to check escrow.');
        }
    }

    private handleRecievedTrade = async (offer: TradeOffer) => {
        const partner = offer.partner;
        const tradeID = offer.id;

        try {
            if (await this.checkEscrow(offer)) {
                console.log("Trade will have escrow, declining...");
                await this.declineTrade(tradeID);
                return;
            }
        } catch (e) {
            // Failed to check escrow, leave offer unprocessed.
            console.error(e);
            return;
        }

        let itemsToGive = offer.itemsToGive as any;
        let itemsToReceive = offer.itemsToReceive as any;

        const itemsToGiveObject: MappedItems = this.inventory.mapItemsToObjects(itemsToGive);
        const itemsToReceiveObject: MappedItems = this.inventory.mapItemsToObjects(itemsToReceive);

        // Currently the bot will allow trades containing no items, it will however always make sure that the offer is in our favour.

        try {
            // Attempt to get prices for items on our side of the trade, for us to give.
            itemsToGive = await this.pricelist.checkItemPrices(itemsToGiveObject.itemsArray);
            // Attempt to get prices for items on their side of the trade, for us to receive.
            itemsToReceive = await this.pricelist.checkItemPrices(itemsToReceiveObject.itemsArray)
        } catch (e) {
            console.error(e);
            return;
        }

        if (!itemsToGive.allPriced || !itemsToReceive.allPriced) {
            console.log("Invalid items in trade, unpriced.");
            await this.declineTrade(tradeID);
            return;
        }

        // Edit original items object to include newly formatted item objects that include their associated prices. Leave currencies map untouched.
        itemsToGiveObject.itemsArray = itemsToGive.items;
        itemsToReceiveObject.itemsArray = itemsToReceive.items;

        try {
            const acceptOffer: Boolean = await this.shouldAcceptOffer
            (itemsToGiveObject as ItemsToGiveOrReceive, itemsToReceiveObject as ItemsToGiveOrReceive);

            if (acceptOffer) {
                // Accept offer.
                console.log("Accepting offer.");
                await this.acceptTrade(tradeID);
            } else {
                // Decline offer.
                console.log("Declining offer.");
                await this.declineTrade(tradeID);
            }
        } catch (e) {
            console.error(e);
            console.log("Failed to perform action on trade. It is likely that the trade offer no longer exists.");
            return;
        }
    }
}