import { Pool } from 'pg';
import axios from 'axios';
import addToMapArray from '../Utils/utilities';

import { IInventoryManager } from "./IInventoryManager";
import { Inventory } from '@tf2-automatic/bot-data';
import { tradeItem } from '../Trading/types/tradeItem';
import { SchemaClass } from '../Schema/schema';
import { Schema } from '@tf2autobot/tf2-schema';
import { IPricelist } from '../Pricelist/IPricelist';
import { inventoryItem } from './types/inventoryItem';

import config from '../../config/bot.json';

export class InventoryManager implements IInventoryManager {
    private db: Pool;
    private schemaManager: SchemaClass;
    private schema: Schema;
    private pricelist: IPricelist;
    private inUseAssetIDs: Set<string>;

    constructor(db: Pool, schemaManager: SchemaClass, schema: Schema, pricelist: IPricelist) {
        this.db = db;
        this.schemaManager = schemaManager;
        this.schema = schema;
        this.pricelist = pricelist;
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
        if (this.inUseAssetIDs.has(assetID)) {
            return true;
        }
        return false;
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

    async getBotInventory(): Promise<Inventory> {
        try {
            const response = await axios.get<Inventory>(`http://localhost:3000/inventories/${config.steamid}/440/2?tradableOnly=true`)
            return response.data;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    async getUserInventory(steamid: string): Promise<Inventory> {
        try {
            const response = await axios.get<Inventory>(`http://localhost:3000/inventories/${steamid}/440/2?tradableOnly=true`)
            return response.data;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
    
    async checkStock(itemsToReceive: tradeItem[]): Promise<boolean> {
        try {
            const response = await axios.get<Inventory>(`http://localhost:3000/inventories/${config.steamid}/440/2?tradableOnly=true`);
    
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
}