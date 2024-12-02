import { Pool } from 'pg';
import { IPricelist } from './IPricelist';
import type { Item } from './types/item';
import { tradeItem } from '../Trading/types/tradeItem';
import { KeyPrice } from './types/keyPrice';
import Currencies from '@tf2autobot/tf2-currencies';
import { inventoryItem } from '../Inventory/types/inventoryItem';

export class Pricelist implements IPricelist {
    private db: Pool;

    constructor(db: Pool) {
        this.db = db;
    }

    async getItemPrice(sku: string): Promise<Item> {
        try {
            const res = await this.db.query('SELECT * FROM tf2.pricelist WHERE sku = $1', [sku]);
            if (res.rows.length === 1) {
                const item = res.rows[0];
                const itemObject: Item = {
                    name: item.name,
                    sku: item.sku,
                    buy: new Currencies(item.buy),
                    sell: new Currencies(item.sell),
                    time: item.time,
                }
                return itemObject;
            } else {
                throw new Error('Item not found or multiple results');
            }
        } catch (err) {
            console.error('Error querying the database:', err);
            throw err;
        }
    }

    async getKeyPrice(): Promise<KeyPrice> {
        try {
            const res = await this.db.query('SELECT * FROM tf2.pricelist WHERE sku = $1', ['5021;6']);
            if (res.rows.length === 1) {
                const item = res.rows[0];
                const buy = new Currencies({ keys: 0, metal: item.buy.metal });
                const sell = new Currencies( {keys: 0, metal: item.sell.metal });
                return { buy, sell };
            } else {
                throw new Error('Key price not found or multiple results');
            }
        } catch (err) {
            console.error('Error querying the database:', err);
            throw err;
        }
    }

    async getAllItems(): Promise<Item[]> {
        try {
            const res = await this.db.query('SELECT * FROM tf2.pricelist');
            if (res.rows.length > 0) {
                return res.rows;
            } else {
                console.log('No items found in pricelist.');
            }
        } catch (err) {
            console.error('Error querying the database:', err);
            throw err;
        }
    }

    async checkItemPrices(items: inventoryItem[]): Promise<{ allPriced: boolean; items: tradeItem[] }> {
        const skus = items.map(item => item.sku);
        // const names = items.map(item => item.name);
    
        const query = `
            SELECT sku, name, buy, sell 
            FROM tf2.pricelist 
            WHERE (sku) IN (
                SELECT unnest($1::text[])
            );
        `;
    
        const result = await this.db.query(query, [skus]);
        const pricedItems = result.rows;
    
        const itemsWithPrices: tradeItem[] = [];
        let allPriced = true;
    
        for (const item of items) {
            const pricedItem = pricedItems.find(pricedItem => pricedItem.sku === item.sku);
            if (pricedItem) {
                const buy = pricedItem.buy;
                const sell = pricedItem.sell;
                
                itemsWithPrices.push({
                    ...item,
                    assetid: item.assetid,
                    buy: new Currencies({ keys: buy.keys, metal: buy.metal }),
                    sell: new Currencies({ keys: sell.keys, metal: sell.metal })
                });
            } else {
                allPriced = false;
                break; // Exit the loop early if an unpriced item is found
            }
        }
    
        return { allPriced, items: itemsWithPrices };
    }
}