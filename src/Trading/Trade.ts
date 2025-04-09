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
import { IPartialPricing } from "../Pricelist/IPartialPricing";
import { tradeItem } from "./types/tradeItem";
import Bans from "../Ban/Bans";

export class Trade {
    private inventory: IInventoryManager;
    private pricelist: IPricelist;
    private autokeys: AutoKeys
    private partialPricing: IPartialPricing;
    private bans: Bans;
    private offerQueueManager: OfferQueueManager;
    private temporalPriceStorage: Map<string, tradeItem[]> = new Map();

    constructor(inventory: IInventoryManager, pricelist: IPricelist, autokeys: AutoKeys, partialPricing: IPartialPricing, bans: Bans) {
        this.inventory = inventory;
        this.pricelist = pricelist;
        this.autokeys = autokeys;
        this.partialPricing = partialPricing;
        this.bans = bans;

        this.offerQueueManager = new OfferQueueManager(this.handleRecievedTrade);
    }

    public handleTradeEvents = async (data: ConsumeMessage | null) => {
        if (!data) {
            return;
        }
    
        const message = JSON.parse(data.content.toString());
        const routingKey = data.fields.routingKey;
        // Upon an unrecoverable error, the event will contain the offer ID within the raw object.
        // Else it should be contained within offer.
        let offerID = message.data.offer?.id || message.data.offer?.tradeID || message?.data?.job?.raw?.id;
    
        try {
            switch (routingKey) {
                case 'trades.received':
                    this.offerQueueManager.enqueueOffer(message.data.offer);
                    break;
                case 'trades.sent':
                    console.log(message);
                    break;
                case 'trades.confirmation_needed':
                    // Will throw an error if unsuccessful.
                    await this.confirmOffer(offerID);
                    break;
                case 'trades.changed':
                    // Handles trade state changes, such as when a trade is accepted.
                    await this.processTradeChange(message.data.offer);
                    break;
                case 'trades.error':
                    // This event occurs upon an unrecoverable error related to a trade.
                    console.error(message);
                    throw new Error('Trade Manager: Critical failure in performing action on trade.');
                default:
                    console.log(message);
                    throw new Error('Trade Manager: Unrecognized event.');
            }
        } catch (err) {
            // If an error occurs, we mark the trade as processed to prevent a deadlock.
            if (offerID) {
                this.temporalPriceStorage.delete(offerID);
                this.offerQueueManager.markTradeAsComplete(offerID);
            }
            console.log('Failed to process event', err);
        }
    }

    /**
     * Handles trade state changes and processes trade completion.
     * Only marks the trade as complete after all necessary actions are performed successfully.
    */
    private async processTradeChange(offer: TradeOffer): Promise<void> {
        const offerID = offer.id || offer.tradeID;
        const offerState: TradeOffer['state'] = offer.state;

        try {
            // Accepted
            if (offerState === 3) {
                // Map contains priced items, currencies are already filtered out.
                const itemsReceived: tradeItem[] = this.temporalPriceStorage.get(offerID);

                if (itemsReceived) {
                    await this.partialPricing.recordPurchase(itemsReceived);
                }

                const itemsGiven = this.inventory.mapItemsToObjects(offer.itemsToGive);
                // Remove any traded away items that were marked as 'purchased' in our records.
                // Need to consider a scenario where, for whatever reason, an error occurs while attempting to delete,
                // thus leaving the item in the purchase table, and the potential impacts.
                // Above point should be solved by searching the purchased_item table using assetid paired with SKU.
                await this.partialPricing.removePurchase(itemsGiven.itemsArray);

                // Check if we have given a key used to originally create an autokeys sell listing.
                await this.autokeys.validateKeySellListing(offer);

                // Remove stored offer items from map.
                this.temporalPriceStorage.delete(offerID);

                console.log("Trade complete - code: " + offerState);
            }

        // Mark trade as complete after processing.
        this.offerQueueManager.markTradeAsComplete(offerID);

        } catch (err) {
            console.error('Error processing trade change:', err);
            throw err;
        }
    }

    private confirmOffer = async (id: string) => {
        try {
            await axios.post(`http://127.0.0.1:3000/trades/${id}/confirm`);
            console.log("Confirmed offer: " + id);
        } catch (e) {
            console.error(e);
            throw e;
        }
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
        let hasKeysAndItemsOnSameSide = false;
        // If no keys are involved just metal and a item we set the key rate to the buy price.
        let keyOurSide = false;
        let onlyMetal = false;

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

        /** Decline trades that involve both keys and items on the same side.
    
            This mitigates a exploit where the user can create an offer like the following:
            - Their Side: 3 keys, 1 item.
            - Our Side: 0 keys, metal equivalent to value of their item + combined key buy price.

            If allowed this would mean our bot would be effectively buying keys while under the impression it is a regular trade.
            The user would be able to bypass our key stock limits and force us to sell keys.

            The same could be done if the user wants to buy keys from us, force us to sell.

            The downside to preventing such a scenario and thereby disabling keys and items on the same side
            is that the user cannot create a offer asking to both sell and buy items at the same time, given
            the values on both sides amount to above a key.

            Though I think that this is a reasonable compromise since most offers are received through backpack.tf listings
            which are for individual items.
        */
        
        hasKeysAndItemsOnSameSide = this.hasKeysAndItemsOnSameSide(itemsToGive, itemsToReceive);
        if (hasKeysAndItemsOnSameSide) {
            console.log("Trade involves both keys and items on the same side, declining...");
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

        // TODO. We make the assumption with the current logic that we will have a stock limit of 1 for all items.
        // If in future I want to adjust the stock limits to be higher I will need to reevaluate this area and other
        // parts of my design.
        try {
            // Update item prices based on purchase history before evaluating the trade.
            itemsToGive.itemsArray = await this.partialPricing.applyPartialPricingAdjustments(itemsToGive.itemsArray, keyRate);
        } catch (e) {
            console.error(e);
            console.log("Trade Manager: Failed to update sell price based on purchase history of items.");
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

    // Check if keys and items are on the same side of the trade (on either side).
    private hasKeysAndItemsOnSameSide = (itemsToGive: ItemsToGiveOrReceive, itemsToReceive: ItemsToGiveOrReceive): boolean => {
        const toGiveCurrenciesMap = new Map<string, string[]>(itemsToGive.currenciesMap);
        const toReceiveCurrenciesMap = new Map<string, string[]>(itemsToReceive.currenciesMap);

        const hasKeysOnOurSide = toGiveCurrenciesMap.has('Mann Co. Supply Crate Key');
        const hasKeysOnTheirSide = toReceiveCurrenciesMap.has('Mann Co. Supply Crate Key');

        const hasItemsOnOurSide = itemsToGive.itemsArray.length > 0;
        const hasItemsOnTheirSide = itemsToReceive.itemsArray.length > 0;

        // Check if keys and items are on the same side (either our side or their side)
        const hasKeysAndItemsOnOurSide = hasKeysOnOurSide && hasItemsOnOurSide;
        const hasKeysAndItemsOnTheirSide = hasKeysOnTheirSide && hasItemsOnTheirSide;

        return hasKeysAndItemsOnOurSide || hasKeysAndItemsOnTheirSide;
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

        if (theirValue < ourValue) {
            return false;
        } else {
            return true;
        }
    }

    private calculateCurrencyValue(currenciesMap: Map<string, string[]>, toGive: boolean, keyPrice: KeyPrice) {   
        const keyRate = toGive ? keyPrice.sell.metal : keyPrice.buy.metal;

        let value = 0;

        const keys = (currenciesMap.get('Mann Co. Supply Crate Key')?.length || 0);
        const keysValueInScrap = new Currencies({ metal: (keyRate * keys) }).toValue();

        const refinedValue = (currenciesMap.get('Refined Metal')?.length || 0);
        const reclaimedValue = (currenciesMap.get('Reclaimed Metal')?.length || 0);
        const scrapValue = (currenciesMap.get('Scrap Metal')?.length || 0);

        value += keysValueInScrap;
        value += 9 * refinedValue;
        value += 3 * reclaimedValue;
        value += scrapValue;
        
        return value;
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
        try {
            await axios.post(`http://127.0.0.1:3000/trades/${tradeID}/accept`);
            console.log("Accepted trade: " + tradeID);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    private declineTrade = async (tradeID: string) => {
        try {
            await axios.delete(`http://127.0.0.1:3000/trades/${tradeID}`);
            console.log("Declined trade: " + tradeID);
        } catch (e) {
            console.error(e);
            throw e;
        }
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
                const response = await axios.get(`http://127.0.0.1:3000/escrow/${steamID}`, { params: { token: token } });
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
            const result = await this.bans.isBanned(partner);
            if (result.isBanned) {
                console.log(`Trade Manager: Declining trade due to user (${partner}) being banned.`);
                await this.declineTrade(tradeID);
                return;
            }
        } catch (e) {
            console.error(e);
            throw e;
        }

        try {
            if (await this.checkEscrow(offer)) {
                console.log("Trade will have escrow, declining...");
                await this.declineTrade(tradeID);
                return;
            }
        } catch (e) {
            // Failed to check escrow, leave offer unprocessed.
            console.error(e);
            throw e;
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
            throw e;
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
                // Store received items (bought items) in temporary cache.
                if (itemsToReceiveObject.itemsArray.length > 0) {
                    this.temporalPriceStorage.set(tradeID, itemsToReceiveObject.itemsArray as tradeItem[]);
                }
                await this.acceptTrade(tradeID);
            } else {
                // Decline offer.
                console.log("Declining offer.");
                await this.declineTrade(tradeID);
            }
        } catch (e) {
            console.error(e);
            console.log("Failed to perform action on trade. It is likely that the trade offer no longer exists.");
            throw e;
        }
    }
}