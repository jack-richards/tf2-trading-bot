/**
 * 1. The bots basic functions are handled by the tf2 automatic application.
 * 2. The bptf manager can be interacted with using Hhanuska's module.
 * 3. Crafting can be done via tf2 automatic application, through the API.
 * 
 * Routes I need to complete:
 *  1. What should we do when we are added by a user?
 *  2. What should we do when we are sent an offer?
 *  3. What should we do when we are messaged? (How do we create the offer based on their message?)
 */


import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { BOT_EXCHANGE_NAME } from '@tf2-automatic/bot-data';
import { BOT_MANAGER_EXCHANGE_NAME } from '@tf2-automatic/bot-manager-data';
import { Trade } from '../Trading/Trade';
import { IInventoryManager } from '../Inventory/IInventoryManager';
import { ListingAPI } from '../Listings/ListingAPI';
import { AutoKeys } from '../Inventory/AutoKeys/AutoKeys';

class EventListener {
    private connection: AmqpConnectionManager;
    private tradeManager: Trade;
    private inventoryManager: IInventoryManager;
    private listingManager: ListingAPI;
    private autoKeys: AutoKeys;
    private readyPromise: Promise<void>;

    public channelWrapper: ChannelWrapper;

    constructor(tradeManager: Trade, inventoryManager: IInventoryManager, listingManager: ListingAPI, autoKeys: AutoKeys) {
        this.connection = amqp.connect(['amqp://test:test@localhost:5672']);

        this.tradeManager = tradeManager;
        this.inventoryManager = inventoryManager;
        this.listingManager = listingManager;
        this.autoKeys = autoKeys;

        this.connection.on('connect', () => {
            console.log('Connected!');
        });

        this.connection.on('disconnect', (err) => {
            console.log('Disconnected', err);
        });

        this.connection.on('connectFailed', (err) => {
            console.log('Connection failed', err);
        });

        this.readyPromise = new Promise((resolve, reject) => {
            this.channelWrapper = this.connection.createChannel({
                setup: async (channel: ConfirmChannel) => {
                    try {
                        await channel.assertExchange(BOT_EXCHANGE_NAME, 'topic', { durable: true });
                        await channel.assertExchange(BOT_MANAGER_EXCHANGE_NAME, 'topic', { durable: true });
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                },
            });

            this.channelWrapper.waitForConnect().then(() => {
                console.log('Channel is ready and listening for messages');
            }).catch(reject);

            this.setUpConsumers();
        });
    }

    // Is used to create a queue and associated the given routing keys with that queue, directing the events to it.
    // E.g., if you create the queue 'trading' and give the routing key 'trades-received' and the method signature
    // you want ot handle said events, whenever rabbitmq emits a event under the trades-receieved key, it will be directed
    // into the trading queue and processed by the handler (function) defined.
    public addConsumer(queueName: string, routingKeys: string[], handler: (msg: ConsumeMessage | null) => void) {
        this.channelWrapper.addSetup(async (channel: ConfirmChannel) => {
            await channel.assertQueue(queueName, { durable: true });
            for (const routingKey of routingKeys) {
                await channel.bindQueue(queueName, BOT_EXCHANGE_NAME, routingKey);
                await channel.bindQueue(queueName, BOT_MANAGER_EXCHANGE_NAME, routingKey);
            }
            await channel.consume(queueName, handler, { noAck: false });
        });
    }

    private setUpConsumers = () => {
        // Queue for user added events
        this.addConsumer('trade-exchange-details', ['trades.exchange_details'], this.handleExchangeDetails);

        const tradeRoutingKeys = [
            'trades.received',
            'trades.sent',
            'trades.confirmation_needed',
            'trades.changed',
            'trades.failed',
            'trades.error'
        ];
        // Queue for trade events e.g., received offer.
        this.addConsumer('trade-events', tradeRoutingKeys, this.handleTradeEvents);
    }

    private handleExchangeDetails = async (msg: ConsumeMessage | null) => {
        try {
            await this.listingManager.handleExchange(msg);
            // 1. TODO. Check if autokeys is needed. I.e., create listings. I believe that it would be best
            // to call the listing creation logic of the listing manager within the autokeys class since we
            // would have just updated the infromation and have easy access to it.
            await this.autoKeys.checkAutoKeys();
            // 2. Check inventory to see if crafting is needed.

            // Acknowledge the message if it was handled.
            this.channelWrapper.ack(msg);
        } catch (e) {
            // Set the event to not requeue, however if needs be this can be altered.
            this.channelWrapper.nack(msg, false, false);
        }
    }

    private handleTradeEvents = async (msg: ConsumeMessage | null) => {
        try {
            this.tradeManager.handleTradeEvents(msg);
            this.channelWrapper.ack(msg);
        } catch (e) {
            this.channelWrapper.nack(msg, false, false);
        }
    }
  
    public waitForReady (): Promise<void> {
        return this.readyPromise;
    }
}

export default EventListener;