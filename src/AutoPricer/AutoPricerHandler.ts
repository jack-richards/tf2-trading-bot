import { io, Socket } from 'socket.io-client';
import { ListingAPI } from '../Listings/ListingAPI';
import { AutoKeys } from '../Inventory/AutoKeys/AutoKeys';

export class AutoPricerHandler {
    private listingManager: ListingAPI;
    private autokeys: AutoKeys;
    // Connect to the Socket.IO server
    private socket: Socket;

    constructor (listingManager: ListingAPI, autokeys: AutoKeys) {
        this.listingManager = listingManager;
        this.autokeys = autokeys;
        this.socket = io('http://localhost:3456');

        // Event handler for when the connection is established
        this.socket.on('connect', () => {
            console.log('Connected to socket.');
        });

        // Event handler for messages from the server
        this.socket.on('pricesChanged', async () => {
            try {
                await this.listingManager.updateExistingListings();
            } catch (e) {
                console.error(e);
            }
        });

        this.socket.on('keyPrice', async () => {
            try {
                const assetid = this.autokeys.getKeyInUse();
                const buyAmount = this.autokeys.getKeysToBuy();
                const sellAmount = this.autokeys.getKeysToSell();

                const isSelling = this.autokeys.getIsSellingKeys();
                const isBuying = this.autokeys.getIsBuyingKeys();

                if (assetid) {
                    await this.listingManager.updateKeyListing(isSelling, isBuying, sellAmount, buyAmount, assetid);
                } else {
                    await this.listingManager.updateKeyListing(isSelling, isBuying, sellAmount, buyAmount);
                }
            } catch (e) {
                console.error(e);
            }
        });
    }
}