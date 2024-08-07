import { ConsumeMessage } from "amqplib";
import EventListener from "./BotEvents/EventListener";
import pool from "./Database/db";
import { IInventoryManager } from "./Inventory/IInventoryManager";
import { InventoryManager } from "./Inventory/InventoryManager";
import { ListingAPI } from "./Listings/ListingAPI";
import { IPricelist } from "./Pricelist/IPricelist";
import { Pricelist } from "./Pricelist/Pricelist";
import { SchemaClass } from "./Schema/schema";
import { Trade } from "./Trading/Trade";
import { AutoKeys } from "./Inventory/AutoKeys/AutoKeys";

const init = async () => {
    const db = pool;

    const schemaManager = new SchemaClass();

    await schemaManager.waitForReady();

    const schema = schemaManager.getSchema();

    const pricelist: IPricelist = new Pricelist(db);

    const inventory: IInventoryManager = new InventoryManager(db, schemaManager, schema, pricelist);

    const listingManager = new ListingAPI(schema, schemaManager, pricelist, inventory);

    await listingManager.waitForReady();

    const autokeys = new AutoKeys(inventory, pricelist, listingManager);

    const tradeManager = new Trade(inventory, pricelist, autokeys);

    const eventListener = new EventListener(tradeManager, inventory, listingManager, autokeys);

    await eventListener.waitForReady();

    // Start listening for events. Will likely also put relevant event handlers within the classes themselves so that it's organised.
};

init().catch(error => {
    console.error(error);
})
