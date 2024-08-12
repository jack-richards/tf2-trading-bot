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
import { CraftingManager } from "./Crafting/CraftingManager";
import { ICraftingManager } from "./Crafting/ICraftingManager";
import { AutoPricerHandler } from "./AutoPricer/AutoPricerHandler";
import { IPartialPricing } from "./Pricelist/IPartialPricing";
import { PartialPricing } from "./Pricelist/PartialPricing";

const init = async () => {
    const db = pool;

    const schemaManager = new SchemaClass();

    await schemaManager.waitForReady();

    const schema = schemaManager.getSchema();

    const pricelist: IPricelist = new Pricelist(db);

    const inventory: IInventoryManager = new InventoryManager(schemaManager, schema);

    const partialPricing: IPartialPricing = new PartialPricing(db);

    await partialPricing.waitForReady();

    const listingManager = new ListingAPI(schema, schemaManager, pricelist, inventory, partialPricing);

    await listingManager.waitForReady();

    const autokeys = new AutoKeys(inventory, pricelist, listingManager);

    await autokeys.checkAutoKeys();

    // @ts-ignore: Unused variable
    const autopricerHandler: AutoPricerHandler = new AutoPricerHandler(listingManager, autokeys);

    const craftingManager: ICraftingManager = new CraftingManager(inventory);

    const tradeManager = new Trade(inventory, pricelist, autokeys, partialPricing);

    const eventListener = new EventListener(tradeManager, listingManager, autokeys, craftingManager);

    await eventListener.waitForReady();
};

init().catch(error => {
    console.error(error);
})
