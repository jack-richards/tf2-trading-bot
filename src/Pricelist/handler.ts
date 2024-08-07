import { io, Socket } from 'socket.io-client';
import { Item } from './types/item';

// Connect to the Socket.IO server
const socket: Socket = io('http://localhost:3456');

// Event handler for when the connection is established
socket.on('connect', () => {
    console.log('Connected to socket.');
});

// Event handler for messages from the server
socket.on('price', (item: Item) => {
    try {
        handleEvent(item);
    } catch (e) {
        console.error(e);
    }
});

// Function to handle the parsed event data
const handleEvent = (item: Item) => {
    console.log(item.name);
    // TODO. Listing manager should be called and any relevant listings should be updated.
}