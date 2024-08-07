import { CraftRecipe } from "@tf2-automatic/bot-data";
import { IInventoryManager } from "../Inventory/IInventoryManager";
import { ICraftingManager } from "./ICraftingManager";
import { EconItem } from "tf2-item-format/.";

export class CraftingManager implements ICraftingManager {
    /**
     * 	"22": "Smelt Reclaimed Metal",
		"23": "Smelt Refined Metal",
        "4": "Combine Scrap Metal",
		"5": "Combine Reclaimed Metal",

        smelt means to break down.
        combine means to rebuild.
     */

    private InventoryManager: IInventoryManager;

    constructor(inventoryManager: IInventoryManager) {
        this.InventoryManager = inventoryManager;
    }

    public craft = async (recipe: CraftRecipe) => {
        const inventory = await this.InventoryManager.getBotInventory();
        const mappedInventory = this.InventoryManager.mapItemsToObjects(inventory as any as EconItem[]);
        
        const currenciesMap = new Map<string, string[]>(mappedInventory.currenciesMap);

        // Filter out in use currencies.

        if (recipe === CraftRecipe.SmeltRefined) {

        } else if (recipe === CraftRecipe.SmeltReclaimed) {

        } else if (recipe === CraftRecipe.CombineScrap) {

        } else if (recipe === CraftRecipe.CombineReclaimed) {

        }
    }
}