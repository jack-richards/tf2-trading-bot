import Schema from '@tf2autobot/tf2-schema';
import config from '../../config/schema.json';
import fs from 'fs';
import SchemaManager from '@tf2autobot/tf2-schema';
import { parseEconItem } from 'tf2-item-format/static'

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
            this.schemaManager.init(() => {
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
}
