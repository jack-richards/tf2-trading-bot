import { CreateListing, ListingManager, RemoveListing } from "tf2automatic-bptf-manager";
import { steamid, token, host, port } from "../../config/bptf-listings.json";

import { IPricelist } from "../Pricelist/IPricelist";
import { Schema } from "@tf2autobot/tf2-schema";
import SKU from "@tf2autobot/tf2-sku";
import { IInventoryManager } from "../Inventory/IInventoryManager";
import { Inventory } from "@tf2-automatic/bot-data";
import type { Item } from "../Pricelist/types/item";
import TF2Currencies from '@tf2autobot/tf2-currencies';

import listingConfig from '../../config/bptf-listings.json'
import { ConsumeMessage } from "amqplib";
import { OfferDetails } from "../Trading/types/offerDetails";
import { SchemaClass } from "../Schema/schema";
import { ParsedEconItem } from "tf2-item-format/.";
import { tradeItem } from "../Trading/types/tradeItem";
import { Mutex } from "async-mutex";
import { IPartialPricing } from "../Pricelist/IPartialPricing";

export class ListingAPI {
    private schema: Schema;
    private schemaManager: SchemaClass;
    private pricelist: IPricelist;
    private listingManager: ListingManager;
    private inventory: IInventoryManager;
    private partialPricing: IPartialPricing;
    private readyPromise: Promise<void>;

    private listingMutex = new Mutex();

    constructor(schema: Schema, schemaManager: SchemaClass, pricelist: IPricelist, inventory: IInventoryManager, partialPricing: IPartialPricing) {
        this.schema = schema;
        this.schemaManager = schemaManager;
        this.pricelist = pricelist;
        this.inventory = inventory;
        this.partialPricing = partialPricing;

        this.listingManager = new ListingManager({
            steamid,
            token,
            host,
            port,
            schema: this.schema
        });

        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.listingManager.init(async (err) => {
                if (err) {
                    console.error('Error initializing listingManager:', err);
                    reject(err);
                    return;
                }
                console.log('Listing Manager: Ready.');
                console.log('Listing Manager: Deleting all listings.');
                await this.listingManager.removeAllListings().catch((e) => {
                    // If a error occurs reject promise and throw error, we want the application
                    // to crash so it can restart with pm2 and reattempt initialisation.
                    reject(e);
                    throw e;
                });
                console.log('Listing Manager: Creating all initial listings.');
                await this.createInitialListings();
                resolve();
            });
        });
    }

    public createKeyListing = async (amount: number, intent: 1 | 0, assetID?: string) => {
        let keyListing: CreateListing;

        const key = await this.pricelist.getItemPrice('5021;6');

        if (intent === 1 && assetID) {
            keyListing = { id: assetID, details: this.generateDetails(key, 'sell', amount), currencies: key.sell, intent: 1 };
        } else {
            keyListing = { sku: '5021;6', details: this.generateDetails(key, 'buy', amount), currencies: key.buy, intent: 0 };
        }

        await this.createListing(keyListing);
    }

    public deleteKeyListings = async (keyAssetID?: string) => {
        if (keyAssetID) {
            await this.removeListing({ id: keyAssetID, intent: 1 })
        }
        await this.removeListing({ sku: '5021;6', intent: 0 });
    }

    // Export functions for other modules to use
    public createListing = async (listing: CreateListing) => {
        const release = await this.listingMutex.acquire();
        try {
            if (!this.listingManager || !this.listingManager.ready) {
                throw new Error('Listing Manager is not ready');
            }
            this.listingManager.createListing(listing);
        } catch (e) { 
            console.error(e);
            throw e;
        } finally {
            release();
        }
    };

    public removeListing = async (listing: RemoveListing) => {
        const release = await this.listingMutex.acquire();
        try {
            if (!this.listingManager || !this.listingManager.ready) {
                throw new Error('Listing Manager is not ready');
            }
            this.listingManager.removeListing(listing);
        } catch (e) { 
            console.error(e);
            throw e;
        } finally {
            release();
        }
    };

    public createListings = async (listings: CreateListing[]) => {
        const release = await this.listingMutex.acquire();
        try {
            if (!this.listingManager || !this.listingManager.ready) {
                throw new Error('Listing Manager is not ready');
            }
            this.listingManager.createListings(listings);
        } catch (e) { 
            console.error(e);
            throw e;
        } finally {
            release();
        }
    }

    public removeListings = async (listings: RemoveListing[]) => {
        const release = await this.listingMutex.acquire();
        try {
            if (!this.listingManager || !this.listingManager.ready) {
                throw new Error('Listing Manager is not ready');
            }
            this.listingManager.removeListings(listings);
        } catch (e) { 
            console.error(e);
            throw e;
        } finally {
            release();
        }
    }

    public updateKeyListing = async (isSelling: boolean, isBuying: boolean, sellAmount?: number, buyAmount?: number, assetid?: string) => {
        const release = await this.listingMutex.acquire();
        try {
            const keyPrice: Item = await this.pricelist.getItemPrice('5021;6');

            if (assetid && isSelling && sellAmount) {
                // Update sell listing.
                this.createListing({ id: assetid, intent: 1, currencies: keyPrice.sell, details: this.generateDetails(keyPrice, 'sell', sellAmount) });
            }
            
            if (isBuying && buyAmount) {
                this.createListing({ sku: '5021;6', intent: 0, currencies: keyPrice.buy, details: this.generateDetails(keyPrice, 'buy', buyAmount) });
            }
        } catch (e) {
            console.error(e);
        } finally {
            release();
        }
    }

    public updateExistingListings = async () => {
        const release = await this.listingMutex.acquire();
        try {
            const keyRate = (await this.pricelist.getKeyPrice()).sell.metal;
            const inventory = await this.inventory.getBotInventory();
            // Get current desired listings.
            const desiredListings = await this.listingManager.manager.getDesiredListings();
            const updatedListings: CreateListing[] = []; 

            for (const desiredListing of desiredListings) {
                const listing = desiredListing.listing;

                if (listing.intent === 0) {
                    // Will take the item object from bptf listing and convert it into a standard SKU object that we can draw a valid SKU from.
                    const sku = SKU.fromObject(this.schemaManager.getItem(listing) as any);

                    // Skip keys, we will update those listings elsewhere.
                    if (sku === '5021;6') {
                        continue;
                    }

                    const pricedItem = await this.pricelist.getItemPrice(sku);

                    listing.currencies = pricedItem.buy;
                } else if (listing.intent === 1) {
                    // No item object is provided if intent is to sell, need to find item within inventory and draw data from that.
                    const item = inventory.find((item => item.assetid === listing.id));

                    if (item) {
                        const fullName = this.schemaManager.convertIEconItem(item).fullName;
                        const sku = this.schema.getSkuFromName(fullName);

                        if (sku === '5021;6') {
                            continue;
                        }

                        const pricedItem: Item = await this.pricelist.getItemPrice(sku);
                        const tradeItem: tradeItem = { ...pricedItem, assetid: listing.id };

                        // Check for partial pricing.
                        const adjustedItems: tradeItem[] = await this.partialPricing.applyPartialPricingAdjustments([tradeItem], keyRate);

                        // Ensure that item is returned with adjusted (or not) prices.
                        if (adjustedItems.length > 0) {
                            listing.currencies = adjustedItems[0].sell;
                        } else {
                            throw new Error("Listing Manager: Could not create listing, unable to adjust price accounting for partial pricing.")
                        }
                    } else {
                        throw new Error("Listing Manager: Could not create sell listing, unable to find within inventory via assetid.");
                    }
                }
                updatedListings.push(listing);
            }
            this.listingManager.createListings(updatedListings);
        } catch (e) {
            console.error(e);
        } finally {
            release();
        }
    }

    public handleExchange = async (msg: ConsumeMessage | null) => {
        if (!msg) {
            return;
        }

        try {
            const message = JSON.parse(msg.content.toString());
            const routingKey = msg.fields.routingKey;

            switch (routingKey) {
                case 'trades.exchange_details':
                    const details = message.data.details;
                    // If the offer has a details section and has been accepted.
                    if(details && details.status === 3) {
                        await this.handleAcceptedTrade(details);
                    }
                    break;
                default:
                    throw new Error('Unrecognised event.');
            }
        } catch (err) {
            console.log('Failed to parse event', err);
        }
    }

    private handleAcceptedTrade = async (details: OfferDetails) => {
        const mappedItemsToSell = this.inventory.mapItemsToObjects(details.receivedItems);
        const mappedItemsToBuy = this.inventory.mapItemsToObjects(details.sentItems);
        
        try {
            // Attempt to get prices for item(s) we bought, will be used to create new sell listing(s).
            const receivedItemPrices = await this.pricelist.checkItemPrices(mappedItemsToSell.itemsArray);
            // Attempt to get prices for item(s) we sold, will be used to create new buy listing(s).
            const sentItemPrices = await this.pricelist.checkItemPrices(mappedItemsToBuy.itemsArray);

            if (!receivedItemPrices.allPriced || !sentItemPrices.allPriced) {
                throw new Error("Items either received or sent were not able to be priced. Will not create listing(s).");
            }

            const createSellListings: CreateListing[] = [];
            const createBuyListings: CreateListing[] = [];

            const deleteSellListings: RemoveListing[] = [];
            const deleteBuyListings: RemoveListing[] = [];

            // Use a set to ensure unique SKUs for buy listings
            const sentItemSet = new Set<string>();

            // Handle received items: create sell listings and delete buy listings
            for (const item of receivedItemPrices.items) {
                // Create new sell listing for each received item.
                createSellListings.push(await this.convertItemToListing(item, item.assetid));
                // Need to delete any existing buy listing for the item.
                deleteBuyListings.push({ sku: item.sku, intent: 0 });
            }

            // Handle sent items: create buy listings and delete sell listings
            for (const item of sentItemPrices.items) {
                if (!sentItemSet.has(item.sku)) {
                    sentItemSet.add(item.sku);
                    // Create a single buy listing for the item.
                    createBuyListings.push(await this.convertItemToListing(item));
                }
                // Need to delete any existing sell listing for the item traded.
                deleteSellListings.push({ id: item.assetid, sku: item.sku, intent: 1 });
            }

            // Remove old listings
            await this.removeListings(deleteSellListings.concat(deleteBuyListings));
            // Create new listings
            await this.createListings(createSellListings.concat(createBuyListings));
        } catch (e) {
            console.error(e);
            return;
        }
    }

    private createInitialListings = async () => {
        try {
            const pricelistItems: Item[] = await this.pricelist.getAllItems();
            const inventory: Inventory = await this.inventory.getBotInventory();

            const { sellList, buyList } = await this.findSellAndBuyItems(pricelistItems, inventory);

            const listings = sellList.concat(buyList);

            console.log("Creating listings...");

            await this.createListings(listings);
        } catch (e) {
            console.error(e);
        }
    }

    private findSellAndBuyItems = async (pricelistItems: Item[], inventory: Inventory): Promise<{ sellList: CreateListing[]; buyList: CreateListing[]; }> => {
        const sellList: CreateListing[] = [];
        const buyList: CreateListing[] = [];
    
        const inventoryMap = this.mapInventoryBySku(inventory);
    
        for (const pricelistItem of pricelistItems) {
            const sku = pricelistItem.sku;
            if (inventoryMap.has(sku)) {
                const assetids = inventoryMap.get(sku);
                while (assetids && assetids.length) {
                    const assetid = assetids.shift(); // Remove and get the first assetid
                    if (assetid) {
                        const listing = await this.convertItemToListing(pricelistItem, assetid);
                        sellList.push(listing);
                    }
                }
            } else {
                const listing = await this.convertItemToListing(pricelistItem);
                buyList.push(listing);
            }
        }
    
        return { sellList, buyList };
    }

    private mapInventoryBySku(inventory: Inventory): Map<string, string[]> {
        const inventoryMap = new Map<string, string[]>();

        // Convert IEcon items to format that includes names with all information pertaining to each item.
        const convertedItems: ParsedEconItem[] = this.schemaManager.convertIEconItems(inventory);
    
        for (const item of convertedItems) {
            const sku = this.schema.getSkuFromName(item.fullName);

            // If the item is a key skip it.
            if (sku === '5021;6' || item.fullName === 'Mann Co. Supply Crate Key') {
                continue;
            }

            if (!inventoryMap.has(sku)) {
                inventoryMap.set(sku, []);
            }
            inventoryMap.get(sku)?.push(item.id);
        }
    
        return inventoryMap;
    }

    private convertItemToListing = async (item: Item | tradeItem, assetid?: string): Promise<CreateListing> => {
        const listing: Partial<CreateListing> = {};
        const keyRate = (await this.pricelist.getKeyPrice()).sell.metal;
    
        if (assetid) {
            const tradeItem: tradeItem = { ...item, assetid: assetid } 
            // Intent of 1 = sell.
            listing.intent = 1;
            // Id = assetid.
            listing.id = assetid;
            // Partial pricing.
            const adjustedItem: tradeItem[] = await this.partialPricing.applyPartialPricingAdjustments([tradeItem], keyRate);

            if (adjustedItem.length > 0) {
                item.sell.keys = adjustedItem[0].sell.keys;
                item.sell.metal = adjustedItem[0].sell.metal;
                // Set currencies object.
                listing.currencies = new TF2Currencies({
                    keys: item.sell.keys,
                    metal: item.sell.metal 
                });
            } else {
                throw new Error('Listing Manager: Could not create listing, unable to adjust price accounting for partial pricing.');
            }

            // Set details using the generateDetails method.
            listing.details = this.generateDetails(item, 'sell');
        } else {
            // Intent of 0 = buy.
            listing.intent = 0;
            listing.sku = item.sku;
            listing.details = this.generateDetails(item, 'buy');
            // Set currencies object.
            const keys = item.buy.keys;
            const metal = item.buy.metal;
            listing.currencies = new TF2Currencies({ keys, metal });
        }
    
        return listing as CreateListing;
    }

    private generateDetails = (item: Item | tradeItem, buyOrSell: 'buy' | 'sell', amount?: number) => {
        let details: string;
        let price: string;
    
        if (buyOrSell === 'buy') {
            details = listingConfig.buyDetails;
            if (item.buy.keys === 0) {
                price = `${item.buy.metal} metal`
            } else {
                price = `${item.buy.keys} keys, ${item.buy.metal} metal`;
            }
        } else {
            details = listingConfig.sellDetails;
            if (item.sell.keys === 0) {
                price = `${item.sell.metal} metal`
            } else {
                price = `${item.sell.keys} keys, ${item.sell.metal} metal`;
            }
        }
    
        return details
            .replace('%item%', item.name)
            .replace('%price%', price)
            .replace('%amount%', amount !== undefined ? amount.toString() : '');
    }

    public waitForReady(): Promise<void> {
        return this.readyPromise;
    }
}