import Schema from '@tf2autobot/tf2-schema';
import config from '../../config/schema.json';
import fs from 'fs';
import SchemaManager from '@tf2autobot/tf2-schema';
import SKU from '@tf2autobot/tf2-sku';
import { parseEconItem } from 'tf2-item-format/static'
import { BpCreateListingDTO } from 'tf2automatic-bptf-manager/dist/classes/manager';
import { ItemAttributes } from './Types/ItemAttributes';

const SCHEMA_PATH = './schema.json';

export class SchemaClass {
    private schemaManager: SchemaManager;
    private schema: Schema.Schema;
    private readyPromise: Promise<void>;
    private ready = false;

    constructor() {
        this.schemaManager = new Schema({
            apiKey: config.steamAPIKey
        });

        this.initializeSchema();
    }

    private initializeSchema(): void {
        if (fs.existsSync(SCHEMA_PATH)) {
            // A cached schema exists.
            const cachedData = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
            // Set the schema data.
            this.schemaManager.setSchema(cachedData);
        }

        // This event is emitted when the schema has been fetched.
        this.schemaManager.on('schema', (schema: Schema.Schema) => {
            // Writes the schema data to disk.
            fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema.toJSON()));
        });

        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.schemaManager.init((err) => {
                if (err) {
                    reject(err);
                    throw err;
                }
                console.log("Schema manager is ready");
                this.schema = this.schemaManager.schema;
                this.ready = true;
                resolve();
            })
        });
    }

    public convertIEconItem = (item) => {
        return parseEconItem(item, false, true);
    }

    public convertIEconItems = (items) => {
        const convertedItems = [];
        for (const item of items) {
            const convertedItem = parseEconItem(item, false, true);
            convertedItems.push(convertedItem);
        }
        return convertedItems;
    }

    public getSchema(): Schema.Schema {
        if (this.ready) {
            return this.schema;
        } else {
            throw new Error("Schema manager is not ready.");
        }
    }

    public waitForReady(): Promise<void> {
        return this.readyPromise;
    }

/**
 * The following methods (below this comment) were taken from the project node-bptf-listings.
 * Original project: https://github.com/Nicklason/node-bptf-listings/tree/master
 * 
 * Relevant file(s) where the methods were copied from:
 *   - https://github.com/Nicklason/node-bptf-listings/blob/master/classes/listing.js#L54
 *   - https://github.com/Nicklason/node-bptf-listings/blob/master/classes/listing.js#L148
 * 
 * To comply with the terms of the MIT License, a copy of the license from the 
 * node-bptf-listings project is included below:
 * 
 *  MIT License
 *
 *  Copyright (c) 2019 Nicklas Marc Pedersen
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *  SOFTWARE.
 */

     /**
     * From https://github.com/Nicklason/node-bptf-listings/blob/master/classes/listing.js#L54
     * Returns the item in the listings
     * @return {Object}
     */
    public getItem = (listing: BpCreateListingDTO): Object => {
        const item = {
            defindex: listing.item.defindex,
            quality: listing.item.quality,
            craftable: listing.item.flag_cannot_craft !== true
        };

        // Backpack.tf uses item_name for when making listings, meaning that the defindex in some cases is incorrect

        const schemaItem = this.schema.getItemByDefindex(item.defindex as number);
        const schemaItemByName = this.schema.raw.schema.items.find((v) => v.name === schemaItem.item_name);

        if (schemaItemByName !== undefined) {
            item.defindex = schemaItemByName.defindex;
        }

        const attributes = this.parseAttributes(listing.item);

        for (const attribute in attributes) {
            if (!attributes.hasOwnProperty(attribute)) {
                continue;
            }

            item[attribute] = attributes[attribute];
        }

        // Adds default values
        return SKU.fromString(SKU.fromObject(item as any));
    }

     /**`
     * From https://github.com/Nicklason/node-bptf-listings/blob/master/classes/listing.js#L148
     * Parses attributes
     * @return {Object}
     */
     private parseAttributes (item: BpCreateListingDTO['item']) {
        const attributes: ItemAttributes = {};

        const itemAttributes = item.attributes as Array<{ defindex: number; float_value?: number; value?: number | string }>;

        if (itemAttributes === undefined) {
            return attributes;
        }

        for (let i = 0; i < itemAttributes.length; i++) {
            const attribute = itemAttributes[i];
            if (attribute.defindex == 2025) {
                attributes.killstreak = attribute.float_value;
            } else if (attribute.defindex == 2027) {
                attributes.australium = true;
            } else if (attribute.defindex == 134) {
                attributes.effect = attribute.float_value;
            } else if (attribute.defindex == 834) {
                attributes.paintkit = attribute.value;
            } else if (attribute.defindex == 725) {
                // Ensure attribute.value is a string before parsing it
                if (typeof attribute.value === 'string') {
                    attributes.wear = parseInt((parseFloat(attribute.value) * 5).toString());
                } else if (typeof attribute.value === 'number') {
                    attributes.wear = attribute.value * 5;
                }
            } else if (attribute.defindex == 214) {
                attributes.quality2 = 11;
            }
        }

        return attributes;
    }
}
