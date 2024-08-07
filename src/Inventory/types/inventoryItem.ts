// We use this type for both inventory items retrieved from our database and also user items retrieved via a request.
export type inventoryItem = {
    name: string,
    sku: string,
    assetid: string,
    // Can be left blank in the case of another users inventory.
    stock?: number
}