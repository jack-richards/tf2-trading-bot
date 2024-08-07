import { CreateListing, ListingManager, RemoveListing } from "tf2automatic-bptf-manager";
import { steamid, token, host, port } from "../../config/bptf-listings.json";

import { IPricelist } from "../Pricelist/IPricelist";
import { Schema } from "@tf2autobot/tf2-schema";
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
import Currencies from "@tf2autobot/tf2-currencies";

export class ListingAPI {
    private schema: Schema;
    private schemaManager: SchemaClass;
    private pricelist: IPricelist;
    private listingManager: ListingManager;
    private inventory: IInventoryManager;
    private readyPromise: Promise<void>;

    constructor(schema: Schema, schemaManager: SchemaClass, pricelist: IPricelist, inventory: IInventoryManager) {
        this.schema = schema;
        this.schemaManager = schemaManager;
        this.pricelist = pricelist;
        this.inventory = inventory;

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
                await this.listingManager.removeAllListings();
                console.log('Listing Manager: Creating all initial listings.');
                // TODO. Uncomment when done implementing bulk of bot logic. await this.createInitialListings();
                resolve();
            });
        });
    }

    public createKeyListing = async (amount: number, intent: 1 | 0) => {
        const key = await this.pricelist.getItemPrice('5021;6');
        let keyListing: CreateListing;

        if (intent === 1) {
            keyListing = { sku: '5021;6', details: this.generateDetails(key, 'sell'), currencies: key.sell, intent: 1 };
        } else {
            // TODO. Change to buy object instead of custom 0.11 scrap.
            keyListing = { sku: '5021;6', details: this.generateDetails(key, 'buy'), currencies: new Currencies({ keys: 0, metal: 0.11 }), intent: 0 };
        }

        this.createListing(keyListing);
    }

    public deleteKeyListings = () => {
        const intentArray = [0, 1];
        
        for (var i = 0; i < intentArray.length; i++) {
            const intent = intentArray[i];
            this.removeListing({ sku: '5021;6', intent: intent[i] })
        }
    }

    // Export functions for other modules to use
    public createListing = (listing: CreateListing) => {
        if (!this.listingManager || !this.listingManager.ready) {
            throw new Error('Listing Manager is not ready');
        }
        this.listingManager.createListing(listing);
    };

    public removeListing = (listing: RemoveListing) => {
        if (!this.listingManager || !this.listingManager.ready) {
            throw new Error('Listing Manager is not ready');
        }
        this.listingManager.removeListing(listing);
    };

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
                    console.log("yo unrecognised");
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
            // Attempt to get prices for item(s) we sold, will be used to create new sell listing(s).
            const receivedItemPrices = await this.pricelist.checkItemPrices(mappedItemsToSell.itemsArray);
            // Attempt to get prices for item(s) we bought, will be used to create new buy listing(s).
            const sentItemPrices = await this.pricelist.checkItemPrices(mappedItemsToBuy.itemsArray);

            if (!receivedItemPrices.allPriced || !sentItemPrices.allPriced) {
                throw new Error("Items either received or sent were not able to be priced. Will not create listing(s).");
            }

            const createSellListings: CreateListing[] = [];
            const createBuyListings: CreateListing[] = [];

            const deleteSellListings: RemoveListing[] = [];
            const deleteBuyListings: RemoveListing[] = [];

            // TODO. Check for key trade scenario. Probably best todo this from the AutoKeys class.

            // Use a set to ensure unique SKUs for buy listings
            const sentItemSet = new Set<string>();

            // Handle received items: create sell listings and delete buy listings
            for (const item of receivedItemPrices.items) {
                // Create new sell listing for each received item.
                createSellListings.push(this.convertItemToListing(item, item.assetid));
                // Need to delete any existing buy listing for the item.
                deleteBuyListings.push({ sku: item.sku, intent: 0 });
            }

            // Handle sent items: create buy listings and delete sell listings
            for (const item of sentItemPrices.items) {
                if (!sentItemSet.has(item.sku)) {
                    sentItemSet.add(item.sku);
                    // Create a single buy listing for the item.
                    createBuyListings.push(this.convertItemToListing(item));
                }
                // Need to delete any existing sell listing for the item traded.
                deleteSellListings.push({ id: item.assetid, sku: item.sku, intent: 1 });
            }

            // Remove old listings
            this.listingManager.removeListings(deleteSellListings.concat(deleteBuyListings));
            // Create new listings
            this.listingManager.createListings(createSellListings.concat(createBuyListings));
        } catch (e) {
            console.error(e);
            return;
        }
    }

    private createInitialListings = async () => {
        try {
            const pricelistItems: Item[] = await this.pricelist.getAllItems();
            const inventory: Inventory = await this.inventory.getBotInventory();

            const { sellList, buyList } = this.findSellAndBuyItems(pricelistItems, inventory);

            const listings = sellList.concat(buyList);

            console.log("Creating listings...");

            this.listingManager.createListings(listings);
        } catch (e) {
            console.error(e);
        }
    }

    private findSellAndBuyItems(pricelistItems: Item[], inventory: Inventory): { sellList: CreateListing[], buyList: CreateListing[] } {
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
                        const listing = this.convertItemToListing(pricelistItem, assetid);
                        sellList.push(listing);
                    }
                }
            } else {
                const listing = this.convertItemToListing(pricelistItem);
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

    private convertItemToListing = (item: Item | tradeItem, assetid?: string): CreateListing => {
        const listing: Partial<CreateListing> = {};
    
        if (assetid) {
            // Intent of 1 = sell.
            listing.intent = 1;
            // Id = assetid.
            listing.id = assetid;
            // Set details using the generateDetails method.
            listing.details = this.generateDetails(item, 'sell');
            // Set currencies object.
            const keys = item.sell.keys;
            const metal = item.sell.metal;
            listing.currencies = new TF2Currencies({ keys, metal });
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

    private generateDetails = (item: Item | tradeItem, buyOrSell: 'buy' | 'sell') => {
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
            .replace('%price%', price);
    }

    public waitForReady(): Promise<void> {
        return this.readyPromise;
    }
}