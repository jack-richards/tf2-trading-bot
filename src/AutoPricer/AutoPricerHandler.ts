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
        this.socket = io('http://127.0.0.1:3456');

        // Event handler for when the connection is established
        this.socket.on('connect', () => {
            console.log('Connected to socket.');
        });

        // Event handler for messages from the autopricer server
        this.socket.on('pricesUpdated', async () => {
            try {
                await this.listingManager.updateExistingListings();
            } catch (e) {
                console.error(e);
            }
        });

        this.socket.on('keyPrice', async () => {
            try {
                await this.autokeys.checkAutoKeys();
            } catch (e) {
                console.error(e);
            }
        });
    }
}