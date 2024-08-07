import config from "../../../config/autokeys.json";
import { IInventoryManager } from "../IInventoryManager";
import { IPricelist } from "../../Pricelist/IPricelist";
import { EconItem } from "tf2-item-format/.";
import { ListingAPI } from "../../Listings/ListingAPI";

export class AutoKeys {
    // Fields to store the auto keys state
    private isBuyingKeys: boolean = false;
    private isSellingKeys: boolean = false;
    private keysToBuy: number = 0;
    private keysToSell: number = 0;

    private inventoryManager: IInventoryManager;
    private pricelist: IPricelist;
    private listingManager: ListingAPI;

    constructor(inventoryManager: IInventoryManager, pricelist: IPricelist, listingManager: ListingAPI) {
        this.inventoryManager = inventoryManager;
        this.pricelist = pricelist;
        this.listingManager = listingManager;
    }

    // Method to check and update the auto keys state
    public checkAutoKeys = async () => {
        const userMinKeys = config.minKeys;
        const userMaxKeys = config.maxKeys;
        const userMinRef = config.minRef;
        const userMaxRef = config.maxRef;

        if (isNaN(userMinKeys) || isNaN(userMaxKeys) || isNaN(userMinRef) || isNaN(userMaxRef)) {
            console.error(
                "You have entered a non-number value within one or multipleo of the autokeys.json fields," +
                    ' please correct this and restart. Autokeys is disabled until you correct it.'
            );
            this.resetAutoKeysState();
            return;
        }

        const inventory = this.inventoryManager.mapItemsToObjects(await this.inventoryManager.getBotInventory() as any as EconItem[]);
        const pure = new Map<string, string[]>(inventory.currenciesMap);

        const currKeys = pure.get('Mann Co. Supply Crate Key')?.length || 0;
        const currRef = pure.get('Refined Metal')?.length || 0;

        const currKeyPrice = await this.pricelist.getKeyPrice();

        this.isBuyingKeys = currRef > userMaxRef && currKeys < userMaxKeys;
        this.isSellingKeys = currRef < userMinRef && currKeys > userMinKeys;

        const rKeysCanBuy = Math.round((currRef - userMaxRef) / currKeyPrice.buy.toValue());
        const rKeysCanSell = Math.round((userMinRef - currRef) / currKeyPrice.sell.toValue());

        if (this.isBuyingKeys) {
            this.keysToSell = 0;
            this.keysToBuy = rKeysCanBuy;
            // Even if this is spammed multiple buy listings won't be made, it will just
            // attempt to update the existing one if needs be.
            await this.listingManager.createKeyListing(this.keysToBuy, 0);
        } else if (this.isSellingKeys) {
            this.keysToBuy = 0;
            this.keysToSell = rKeysCanSell;
            // TODO. figure out how to approach assetid problem, probably use the same solution as one conjured for crafting process.
            // Add the keys to the same inUseAssetID object or something like that.
            await this.listingManager.createKeyListing(this.keysToSell, 1);
        } else {
            // Delete all key listings.
            // TODO. this.listingManager.deleteKeyListings(); Method is implemented just commented out as I was testing key listing creation.
            this.resetAutoKeysState();
        }
    };

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
}