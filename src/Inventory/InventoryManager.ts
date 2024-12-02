import addToMapArray from '../Utils/utilities';

import { IInventoryManager } from "./IInventoryManager";
import { Inventory } from '@tf2-automatic/bot-data';
import { tradeItem } from '../Trading/types/tradeItem';
import { SchemaClass } from '../Schema/schema';
import { Schema } from '@tf2autobot/tf2-schema';
import { inventoryItem } from './types/inventoryItem';

import config from '../../config/bot.json';
import { ParsedEconItem } from 'tf2-item-format/.';

import axios from "axios";
import axiosRetry from 'axios-retry';

export class InventoryManager implements IInventoryManager {
    private schemaManager: SchemaClass;
    private schema: Schema;
    private inUseAssetIDs: Set<string>;
    private inventory: Inventory;
    private retryAxios = axios.create(); 

    constructor(schemaManager: SchemaClass, schema: Schema) {
        this.schemaManager = schemaManager;
        this.schema = schema;
        this.inUseAssetIDs = new Set();

        axiosRetry(this.retryAxios, { retries: 5, retryDelay: (retryCount) => {
            // Start with a 1 second delay then exponentially increase. Next retry is 2 seconds etc.
            return Math.pow(2, retryCount - 1) * 1000;
         },
        });
    }

    public addInUseAssetIDs(assetIDs: string[]): void {
        for (const assetID of assetIDs) {
            this.addInUseAssetID(assetID);
        }
    }

    public addInUseAssetID = (assetID: string) => {
        if (!this.inUseAssetIDs.has(assetID)) {
            this.inUseAssetIDs.add(assetID);
        }
    }

    public assetIDInUse = (assetID: string) => {
        return this.inUseAssetIDs.has(assetID);
    }

    public removeAssetIDsFromUse = (assetIDs: string[]) => {
        for (const assetID of assetIDs) {
            this.removeAssetIDFromUse(assetID);
        }
    }

    public removeAssetIDFromUse = (assetID: string) => {
        if (this.inUseAssetIDs.has(assetID)) {
            this.inUseAssetIDs.delete(assetID);
        }
    }
    
    public getAssetIDsInUse(): Set<string> {
        return this.inUseAssetIDs;    
    }

    async getBotInventory(fetch: boolean = false): Promise<Inventory> {
        try {
            let inventory = this.inventory;

            if (fetch || !inventory) {
                inventory = (await this.retryAxios.get<Inventory>(`http://127.0.0.1:3000/inventories/${config.steamid}/440/2?tradableOnly=true`)).data;
            }
            return inventory;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    async updateBotInventory(): Promise<void> {
        try {
            this.inventory = (await this.retryAxios.get<Inventory>(`http://127.0.0.1:3000/inventories/${config.steamid}/440/2?tradableOnly=true`)).data;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    async getUserInventory(steamid: string): Promise<Inventory> {
        try {
            const response = await this.retryAxios.get<Inventory>(`http://127.0.0.1:3000/inventories/${steamid}/440/2?tradableOnly=true`)
            return response.data;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
    
    async checkStock(itemsToReceive: tradeItem[]): Promise<boolean> {
        try {
            const response = await this.retryAxios.get<Inventory>(`http://127.0.0.1:3000/inventories/${config.steamid}/440/2?tradableOnly=true`);
    
            const currencies = ['Mann Co. Supply Crate Key', 'Refined Metal', 'Reclaimed Metal', 'Scrap Metal'];
    
            // Exclude currencies.
            const inventory = response.data.filter(item => !currencies.some(currency => currency === item.market_hash_name));

            const inventoryItemObjects = this.schemaManager.convertIEconItems(inventory);
    
            // Create a set of item names within inventory for quick lookup.
            const inventoryNames = new Set(inventoryItemObjects.map(item => item.fullName));
    
            // Check if any item in itemsToReceive is already in the inventory.
            for (const item of itemsToReceive) {
                if (inventoryNames.has(item.name)) {
                    return true; // Indicate overstock
                }
            }
    
            return false; // No overstock found
        } catch (error) {
            throw error;
        }
    }
    
    public mapItemsToObjects = (itemsToGiveOrReceive) => {
        const itemsArray: inventoryItem[] = [];

        const currencies = ['Mann Co. Supply Crate Key', 'Refined Metal', 'Reclaimed Metal', 'Scrap Metal'];

        // Name - assetid.
        let currenciesMap = new Map<string, string[]>();

        for (const item of itemsToGiveOrReceive) {

            let assetid = item.assetid;
            if (item.new_assetid) {
                assetid = item.new_assetid;
            }

            // If we identify a currency we add it to our currency map.
            if (currencies.some(currency => currency === item.market_hash_name)) {
                currenciesMap = addToMapArray(item.market_hash_name, assetid, currenciesMap);
                // Skip further processing, only want it included in currencies map.
                continue;
            }

            const fullName = this.schemaManager.convertIEconItem(item).fullName;
            const sku = this.schema.getSkuFromName(fullName);

            itemsArray.push({ name: fullName, sku, assetid });
        }

        return { currenciesMap: Array.from(currenciesMap.entries()), itemsArray };
    }

    public getAvailableKeys = async (inventory?: Inventory) => {
        try {
            // If we have passed a inventory search that instead, else request it.
            if (!inventory) {
                const response = await this.retryAxios.get<Inventory>(`http://127.0.0.1:3000/inventories/${config.steamid}/440/2?tradableOnly=true`);
                inventory = response.data;
            }

            const inventoryItemObjects: ParsedEconItem[] = this.schemaManager.convertIEconItems(inventory);

            // Extract the assetids of items where fullName is 'Mann Co. Supply Crate Key' and id isn't in use within an active trade.
            const keys = inventoryItemObjects
                .filter(item => item.fullName === 'Mann Co. Supply Crate Key' && !this.inUseAssetIDs.has(item.id))
                .map(item => item.id);

            if (keys.length > 0) {
                return keys;
            } else {
                throw new Error('No keys found available to create sell listing.');
            }
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}