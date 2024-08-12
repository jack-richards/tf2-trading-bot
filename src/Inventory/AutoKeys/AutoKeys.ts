import config from "../../../config/autokeys.json";
import { IInventoryManager } from "../IInventoryManager";
import { IPricelist } from "../../Pricelist/IPricelist";
import { ListingAPI } from "../../Listings/ListingAPI";
import { TradeOffer } from "@tf2-automatic/bot-data";
import { Mutex } from 'async-mutex';

export class AutoKeys {
    // Fields to store the auto keys state
    private isBuyingKeys: boolean = false;
    private isSellingKeys: boolean = false;
    private keysToBuy: number = 0;
    private keysToSell: number = 0;

    private inventoryManager: IInventoryManager;
    private pricelist: IPricelist;
    private listingManager: ListingAPI;

    private keyInUse: string | null = null;
    private mutex = new Mutex();  // Initialize the mutex

    constructor(inventoryManager: IInventoryManager, pricelist: IPricelist, listingManager: ListingAPI) {
        this.inventoryManager = inventoryManager;
        this.pricelist = pricelist;
        this.listingManager = listingManager;
    }

    // Method to check and update the auto keys state
    public checkAutoKeys = async () => {
        // Acquire mutex lock.
        const release = await this.mutex.acquire();
        try {
            const userMinKeys = config.minKeys;
            const userMaxKeys = config.maxKeys;
            const userMinRef = config.minRef;
            const userMaxRef = config.maxRef;

            if (isNaN(userMinKeys) || isNaN(userMaxKeys) || isNaN(userMinRef) || isNaN(userMaxRef)) {
                console.error(
                    "Autokeys: You have entered a non-number value within one or multiple of the autokeys.json fields," +
                    ' please correct this and restart. Autokeys is disabled until you correct it.'
                );
                this.resetAutoKeysState();
                return;
            }

            const inventory = await this.inventoryManager.getBotInventory();
            const mappedInventory = this.inventoryManager.mapItemsToObjects(inventory);

            const pure = new Map<string, string[]>(mappedInventory.currenciesMap);

            const currKeys = pure.get('Mann Co. Supply Crate Key')?.length || 0;
            const currRef = pure.get('Refined Metal')?.length || 0;

            const currKeyPrice = await this.pricelist.getKeyPrice();

            this.isBuyingKeys = currRef > userMaxRef && currKeys < userMaxKeys;
            this.isSellingKeys = currRef < userMinRef && currKeys > userMinKeys;

            // Convert (excess) refined metal to scrap value.
            const scrapExcess = (currRef - userMaxRef) * 12;
            // Determine how many keys can be bought.
            const rKeysCanBuy = Math.round(scrapExcess / currKeyPrice.buy.toValue());

            const scrapNeeded = (userMinRef - currRef) * 12;
            const rKeysCanSell = Math.round(scrapNeeded / currKeyPrice.sell.toValue());

            if (this.isBuyingKeys) {
                this.keysToSell = 0;
                this.keysToBuy = rKeysCanBuy;
                // Even if this is spammed multiple buy listings won't be made, it will just
                // attempt to update the existing one if needs be.
                await this.listingManager.createKeyListing(this.keysToBuy, 0);
            } else if (this.isSellingKeys) {
                this.keysToBuy = 0;
                this.keysToSell = rKeysCanSell;
                try {
                    if (this.keyInUse === null) {
                        const assetIDs = await this.inventoryManager.getAvailableKeys(inventory);
                        if (assetIDs && assetIDs.length > 0) {
                            // Get assetid from very back of inventory, less likely to be used in a trade.
                            this.keyInUse = assetIDs[assetIDs.length - 1];
                            await this.listingManager.createKeyListing(this.keysToSell, 1, this.keyInUse);
                        } else {
                            throw new Error('Autokeys: No available keys to create new sell listing.');
                        }
                    } else {
                        // If the key listing still exists (because assetid is not null) we update the existing listing as we may now be selling less keys.
                        await this.listingManager.updateKeyListing(this.isSellingKeys, this.isBuyingKeys, this.keysToSell, this.keysToBuy, this.keyInUse);
                    }
                } catch (e) {
                    console.error(e);
                    console.log('Autokeys: Failed to create key sell listing.');
                }
            } else {
                // Delete all key listings.
                if (this.keyInUse === null) {
                    this.listingManager.deleteKeyListings();
                } else {
                    this.listingManager.deleteKeyListings(this.keyInUse);
                    // Key no longer in use as we have just deleted all listings.
                    this.keyInUse = null;
                }
                this.resetAutoKeysState();
            }
        } finally {
            // Release the mutex.
            release();
        }
    };

    public validateKeySellListing = async (offer: TradeOffer) => {
        const release = await this.mutex.acquire();
        try {
            const keyTraded = offer.itemsToGive.find(item => item.assetid === this.keyInUse);
            // If the key has been traded away then we need to re-check autokeys and re-create the sell listing.
            if (keyTraded) {
                // Set keyInUse to null.
                this.keyInUse = null;
                // Remove associated listing.
                this.listingManager.removeListing({ id: keyTraded.assetid, intent: 1 });
                // Check autokeys.
                await this.checkAutoKeys();
            }
        } catch (e) {
            console.error(e);
        } finally {
            release();
        }
    }

    // Method to reset the auto keys state
    private resetAutoKeysState() {
        this.isBuyingKeys = false;
        this.isSellingKeys = false;
        this.keysToBuy = 0;
        this.keysToSell = 0;
    }

    // Getter methods to access the auto keys state
    public getIsBuyingKeys(): boolean {
        return this.isBuyingKeys;
    }

    public getIsSellingKeys(): boolean {
        return this.isSellingKeys;
    }

    public getKeysToBuy(): number {
        return this.keysToBuy;
    }

    public getKeysToSell(): number {
        return this.keysToSell;
    }

    public getKeyInUse(): string | null {
        return this.keyInUse;
    }
}