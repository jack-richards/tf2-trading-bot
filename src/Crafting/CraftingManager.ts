import { CraftRecipe } from "@tf2-automatic/bot-data";
import { IInventoryManager } from "../Inventory/IInventoryManager";
import { ICraftingManager } from "./ICraftingManager";
import { EconItem } from "tf2-item-format/.";

import config from '../../config/crafting.json';
import { CraftRecipeDetails } from "./types/CraftRecipeDetails";
import axios from "axios";

export class CraftingManager implements ICraftingManager {
    /**
     * 	"22": "Smelt Reclaimed Metal",
		"23": "Smelt Refined Metal",
        "4": "Combine Scrap Metal",
		"5": "Combine Reclaimed Metal",

        Smelt means to break down.
        Combine means to create currency of next tier.
     */

    private inventoryManager: IInventoryManager;

    constructor(inventoryManager: IInventoryManager) {
        this.inventoryManager = inventoryManager;
    }

    public craft = async () => {
        const inventory = await this.inventoryManager.getBotInventory();
        const mappedInventory = this.inventoryManager.mapItemsToObjects(inventory as any as EconItem[]);

        // Convert currenciesMap array to a Map.
        const currenciesMap = new Map<string, string[]>(mappedInventory.currenciesMap);

        const recipes = this.determineCraftingRecipes(currenciesMap);

        try {
            for (const recipe of recipes) {
                await axios.post('http://localhost:3000/tf2/craft', recipe);
            }
        } catch (e) {
            console.error(e);
            console.log('Failed to craft.');
        } 
    }

    private determineCraftingRecipes = (botCurrenciesMap: Map<string, string[]>): CraftRecipeDetails[] => {
        let refinedCount = botCurrenciesMap.get('Refined Metal')?.length || 0;
        let reclaimedCount = botCurrenciesMap.get('Reclaimed Metal')?.length || 0;
        let scrapCount = botCurrenciesMap.get('Scrap Metal')?.length || 0;
    
        const inUseAssetIds = this.inventoryManager.getAssetIDsInUse();
    
        // Filter the currenciesMap
        const filteredCurrenciesMap = this.filterCurrenciesMap(botCurrenciesMap, inUseAssetIds);
    
        const refined = filteredCurrenciesMap.get('Refined Metal') || [];
        const reclaimed = filteredCurrenciesMap.get('Reclaimed Metal') || [];
        const scrap = filteredCurrenciesMap.get('Scrap Metal') || [];
    
        let recipes: CraftRecipeDetails[] = [];
    
        // Ensure we have enough Scrap Metal
        while (scrapCount < config.minScrap && reclaimedCount > 0) {
            const assetid = reclaimed.shift();
            if (assetid) {
                recipes.push({ recipe: CraftRecipe.SmeltReclaimed, assetids: [assetid] });
                reclaimedCount -= 1;
                scrapCount += 3;
            }
        }
    
        // Ensure we have enough Reclaimed Metal
        while (reclaimedCount < config.minReclaimed && refinedCount > 0) {
            const assetid = refined.shift();
            if (assetid) {
                recipes.push({ recipe: CraftRecipe.SmeltRefined, assetids: [assetid] });
                refinedCount -= 1;
                reclaimedCount += 3;
            }
        }
    
        // Handle excess Scrap Metal by combining it into Reclaimed Metal
        while (scrapCount > config.minScrap && scrapCount >= 3) {
            const assetIDs = scrap.splice(0, 3);
            recipes.push({ recipe: CraftRecipe.CombineScrap, assetids: assetIDs });
            scrapCount -= 3;
            reclaimedCount += 1;
        }
    
        // Handle excess Reclaimed Metal by combining it into Refined Metal
        while (reclaimedCount > config.minReclaimed && reclaimedCount >= 3) {
            const assetIDs = reclaimed.splice(0, 3);
            recipes.push({ recipe: CraftRecipe.CombineReclaimed, assetids: assetIDs });
            reclaimedCount -= 3;
            refinedCount += 1;
        }
    
        return recipes;
    }

    // Function to filter out matching in-use asset ids from a provided map of currencies.
    private filterCurrenciesMap = (currenciesMap: Map<string, string[]>, assetIdsSet: Set<string>): Map<string, string[]> => {
        const filteredMap = new Map<string, string[]>();

        currenciesMap.forEach((assetIds, itemName) => {
            const filteredAssetIds = assetIds.filter(assetId => !assetIdsSet.has(assetId));
            filteredMap.set(itemName, filteredAssetIds);
        });

        return filteredMap;
    };
}