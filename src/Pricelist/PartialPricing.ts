import { IPartialPricing } from "./IPartialPricing";
import { Pool } from 'pg';
import { tradeItem } from "../Trading/types/tradeItem";
import { PartialPricedItem } from "./types/partialPricedItem";
import Currencies from "@tf2autobot/tf2-currencies";
import { inventoryItem } from "../Inventory/types/inventoryItem";
import config from "../../config/partialPricing.json";

export class PartialPricing implements IPartialPricing {
    private db: Pool;
    private readyPromise: Promise<void>;

    constructor(db: Pool) {
        this.db = db;

        this.readyPromise = new Promise<void>(async (resolve, reject) => {
            try {
                // Check for existence of database table, if it doesn't exist create it.
                // Maybe add a foreign key relation with pricelist.
                await this.db.query(
                `CREATE TABLE IF NOT EXISTS tf2.purchase_history (
                    id SERIAL PRIMARY KEY,
                    assetid VARCHAR NOT NULL UNIQUE,
                    name VARCHAR NOT NULL,
                    sku VARCHAR NOT NULL,
                    purchase_price JSON NOT NULL,
                    time BIGINT NOT NULL
                );`);
                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
                throw e;
            }
        });
    }

    public recordPurchase = async (items: tradeItem[]) => {
        try {
            const time = Math.floor(Date.now() / 1000);
    
            for (const item of items) {
                const { assetid, name, sku, buy } = item;
        
                await this.db.query(
                    `INSERT INTO tf2.purchase_history (assetid, name, sku, purchase_price, time)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [assetid, name, sku, JSON.stringify(buy), time]
                );
            }
        } catch (e) {
            console.error(e);
        }
    }
    
    public removePurchase = async (items: inventoryItem[]): Promise<void> => {
        try {
            const skus = items.map(item => item.sku);
            const assetids = items.map(item => item.assetid);

            const query = `
                DELETE FROM tf2.purchase_history
                WHERE (sku, assetid) IN (
                    SELECT unnest($1::text[]), unnest($2::text[])
                );
            `;

            await this.db.query(query, [skus, assetids]);
        } catch (e) {
            console.error(e);
        }
    }
    
    private findPartialPricedItem = async (sku: tradeItem['sku'], assetid: tradeItem['assetid']): Promise<PartialPricedItem | null> => {
        const result = await this.db.query(
            `SELECT purchase_price FROM tf2.purchase_history WHERE sku = $1 AND assetid = $2`,
            [sku, assetid]
        );
        
        if (result.rowCount > 0) {
            return result.rows[0];
        } else {
            return null;
        }
    }

    private deleteOldPartialPricedItems = async () => {
        const maxAgeDays = config.partialPricingMaxAgeInDays;
        const cutOffTime = Math.floor(Date.now() / 1000) - (maxAgeDays * 24 * 60 * 60);
    
        await this.db.query(
            `DELETE FROM tf2.purchase_history
             WHERE time < $1`,
            [cutOffTime]
        );
    }

    public applyPartialPricingAdjustments = async (items: tradeItem[], keyRate: number): Promise<tradeItem[]> => {
        const updatedItems: tradeItem[] = [];

        await this.deleteOldPartialPricedItems();
    
        for (const item of items) {
            const { assetid, sku, buy, sell } = item;
    
            const partialPricedItem = await this.findPartialPricedItem(assetid, sku);
            
            if (partialPricedItem) {
                const purchasePrice = new Currencies(partialPricedItem.purchase_price);
    
                if (sell.toValue(keyRate) < purchasePrice.toValue(keyRate)) {
                    const newSellPrice = new Currencies({
                        keys: buy.keys,
                        metal: buy.metal + 0.11
                    });
    
                    // Update the item's sell price.
                    const updatedItem: tradeItem = {
                        ...item,
                        sell: newSellPrice
                    };
    
                    updatedItems.push(updatedItem);
    
                    console.log(`Adjusted sell price for ${sku}: ${newSellPrice}`);
                } else {
                    // No adjustment needed, keep the original pricing.
                    updatedItems.push(item);
    
                    console.log(`Sell price for ${sku} is already valid: ${sell}`);
                }
            } else {
                // No partial pricing found, return the item as is
                updatedItems.push(item);
    
                console.log(`No purchase record found for ${sku}, using standard pricing.`);
            }
        }
    
        return updatedItems;
    }
    

    // Bought item add to partial pricing. (in accepted offer event).

    // During trade, check for partial pricing.

    // During listing update (updated prices event), check for partial pricing.

    // During listing creation after accepted trade.

    public waitForReady(): Promise<void> {
        return this.readyPromise;
    }
}