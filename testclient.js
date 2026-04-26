/* eslint-disable no-console */
import LoxoneClient from './dist/LoxoneClient.js';

// instantiate the client
const client = new LoxoneClient('168-119-185-175.504f94a10e9b.dyndns.loxonecloud.com:51064', 'web', 'web', true, {
    messageLogEnabled: true,
});

// sets log level to debug for more verbose logging
// client.setLogLevel(LogLevel.DEBUG);

// subscribe to basic events
client.on('disconnected', () => {
    console.log('Loxone client disconnected');
});
client.on('error', (error) => {
    console.log(`Loxone client error: ${error.message}`, error);
});

// initiate connection
await client.connect();

await client.parseStructureFile();

// subscribe to Loxone value updates
client.on('event_value', (event) => {
    console.log(`Received value event: ${event.uuid.stringValue}`);
    console.log(`  Room: ${event.state?.parentControl?.room?.name}`);
    console.log(`  Control: ${event.state?.parentControl?.name}`);
    console.log(`  State: ${event.state?.name}`);
    console.log(`  Event path: ${event.toPath()}`);
    // console.log(`  Full event: ${event.toString()}`);
});

// initiates streaming of events
await client.enableUpdates();
