# loxone-ts-api
A Node module written in TypeScript allowing communication with Loxone Miniservers. Communication is done using http and WebSockets.

Currently only implemented http/ws communication to enable support for Gen.1 and Gen.2 Miniservers. https/wss communication not supported, but planned.

## Requirements

Requires a Loxone Miniserver with firmware version 11.2 or higher.

## Authentication

Uses token authentication with the Miniserver. Automatically attempts token refresh before expiry.

## Usage examples

```ts
import { AnsiLogger, LogLevel, TimestampFormat } from "node-ansi-logger";
import LoxoneClient from "./LoxoneClient.js";

let log = new AnsiLogger({logName: "workbench", logTimestampFormat: TimestampFormat.TIME_MILLIS});

// instantiate the client
let client = new LoxoneClient("192.168.1.253:80", "user", "pass");

// sets log level to debug for more verbose logging
client.setLogLevel(LogLevel.DEBUG);

// subscribe to basic events
client.on('disconnected', () => {
    log.warn('Loxone client disconnected');
});
client.on('error', (error) => {
    log.error(`Loxone client error: ${error.message}`, error);
});

// initiate connection
await client.connect();

// gets acquired token
const token = client.auth.tokenHandler.token; 

// disconnects and skips invalidation of token
await client.disconnect(true); 

// uses supplied token for auth instead of acquiring a new one
await client.connect(token); 

// sets a switch to on
await client.control("90f7abe3-8772-476d-b1dd-a5c1c4cf1ed9", "on");

// subscribe to Loxone value updates
client.on('event_value', (event) => {
    log.info(`Received value event for ${event.uuid}, value=${event.value}`);
});

// initiates streaming of events
await client.enablesUpdates(); 

// disconnects and kills token
await client.disconnect(); 
```

## API surface

### `LoxoneClient`

Key entrypoint to the module.

```ts
    LoxoneClient(
        host: string,
        username: string,
        password: string,
        clientOptions: Partial<LoxoneClientOptions>
    )
```

#### Parameters

|parameter|description|
|--|--|
|host|IP address or hostname of the Loxone Miniserver|
|username|username to use|
|password|password for the user|
|clientOptions.autoReconnectEnabled|optional parameter to override the default behavior of automatically reconnecting on failure/disconnection|
|clientOptions.keepAliveEnabled|optional parameter to override the default behavior of enabling a 15 second keepalive
|clientOptions.messageLogEnabled|optional parameter to override the default behavior of enabling a logging of messages and responses

Instantiating a `LoxoneClient` instance does not trigger any network communication.

### `LoxoneClient.connect()`

Initiates the connection to the Loxone Miniserver, negotiates session keys and encryption parameters, as well as attempts token authentication.

Goes through the following sequence
1. Wire up events so LoxoneClient starts emitting connection and Loxone related events
1. Checks the Loxone Miniserver generation and firmware version 
1. Connects the WebSocket connection
1. Performs key exchange and authentication, and schedules automatic token refresh
1. Enables keepalive

#### Parameters

```ts
async connect(existingToken: string = "")
```
|parameter|description|
|--|--|
|existingToken|if supplied, uses the supplied token instead of acquiring a new one|


### `LoxoneClient.disconnect()`

Disconnects the connection and cleans up internal states.

#### Parameters

```ts
async disconnect(preserveToken: boolean = false)
```

|parameter|description|
|--|--|
|preserveToken|optional parameter to skip killing the obtained token so it remains valid after disconnection|


### `LoxoneClient.getStructureFile()`

Retrieves the Loxone structure file (`LoxAPP3.json`)

#### Parameters

```ts
async getStructureFile()
```

### `LoxoneClient.enableUpdates()`

Enables the streaming of binary event updates.

#### Parameters

```ts
async enableUpdates()
```

### `LoxoneClient.sendTextCommand()`

Sends a text command to the Miniserver and waits for the response till timeout (default: 5s, overridable). Automatically applies Command Encryption as needed.

#### Parameters

```ts
async sendTextCommand(command: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<TextMessage>
```

|parameter|description|
|--|--|
|command|The Loxone command to execute|
|timeoutOverride|optional parameter allowing override of the default 5s timeout. Unit is milliseconds|

#### Returns

`TextMessage` object with the response to the command, or an exception.


### `LoxoneClient.sendFileCommand()`

Retrieves a file from the Miniserver and waits for the response till timeout (default: 5s, overridable). 

#### Parameters

```ts
async sendFileCommand(filename: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<FileMessage>
```

|parameter|description|
|--|--|
|filename|Filename of the file to be retrieved|
|timeoutOverride|optional parameter allowing override of the default 5s timeout. Unit is milliseconds|

#### Returns

`FileMessage` object with the file contents, or an exception.


### `LoxoneClient.control()`

Executes a command on a Loxone control identified by its UUID and waits for the response till timeout (default: 5s, overridable)

See the Loxone [structure file](https://www.loxone.com/wp-content/uploads/datasheets/StructureFile.pdf) for documentation on possible commands.

#### Parameters

```ts
async control(uuid: string, command: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<TextMessage>
```

|parameter|description|
|--|--|
|uuid|UUID of the Loxone control to operate|
|command|The command to send|
|timeoutOverride|optional parameter allowing override of the default 5s timeout. Unit is milliseconds|

#### Returns

`TextMessage` object with the result of the operation, or an exception.


### `LoxoneClient.setLogLevel()`

Sets the log level. By default it is set to INFO.

#### Parameters

```ts
setLogLevel(level: LogLevel)
```
|parameter|description|
|--|--|
|level|Loglevel to set logging to. Uses the `node-ansi-logger` module|

### `LoxoneClient.addUuidToWatchList()`

Adds UUIDs to the watch list. Value and text update events will only be emitted for these UUIDs. If the watchlist is empty, all events will be emitted. 

#### Parameters

```ts
addUuidToWatchList(uuid: string | string[])
```
|parameter|description|
|--|--|
|uuid|UUID string or array of strings to add to the watchlist|

### `LoxoneClient.removeUuidFromWatchList()`

Removes UUIDs from the watch list. 

#### Parameters

```ts
removeUuidFromWatchList(uuid: string | string[])
```
|parameter|description|
|--|--|
|uuid|UUID string or array of strings to remove from the watchlist|

### `LoxoneClient.checkToken()`

Checks whether the token is still valid.

#### Parameters

```ts
async checkToken(token: string = "")
```

|parameter|description|
|--|--|
|token|If supplied, checks the supplied token instead of the remembered (active) one|

### `LoxoneClient.refreshToken()`

Refreshes the active token if it is still valid. If not, attempts to acquire a new one.

#### Parameters

```ts
async refreshToken()
```

## Events

The `LoxoneClient` emits the following events:

```ts
  connected: () => void;
```
Fires when the connection is successfully established.

```ts
  authenticated: () => void;
```
Fires when authentication was successful.

```ts
  ready: () => void;
```
Fires when `LoxoneClient` is ready to receive commands.

```ts
  disconnected: (reason: string) => void;
```

Fires when the underlying WebSocket is disconnected.

```ts
  error: (err: Error) => void;
```

Fires when a WebSocket error is encountered.

```ts
  header: (header: ParsedHeader) => void;
```
Fires when a header message is received.

```ts
  keepalive: (header: ParsedHeader) => void;
```
Fires when a keepalive message is received.

```ts
  text_message: (text: TextMessage) => void;
```
Fires when a text message is received on the WebSocket channel.
```ts
  file_message: (file: FileMessage) => void;
```
Fires when a file message is received on the WebSocket channel.

```ts
  event_table_values: (eventTable: LoxoneValueEvent[]) => void;
  event_table_text: (eventTable: LoxoneTextEvent[]) => void;
  event_table_day_timer: (eventTable: LoxoneDayTimerEvent[]) => void;
  event_table_weather: (eventTable: LoxoneWeatherEvent[]) => void;
```
Fires when an event update message is received on the WebSocket channel. EventTables can contain multiple update events of the same kind.
```ts
  stateChanged: (newState: string) => void;
```
Fires when the `LoxoneClient` changes its state. Possible states are:
- disconnected
- disconnecting
- connecting
- connected
- authenticating
- authenticated
- ready
- reconnecting
- error

```ts
  event_value: (event: LoxoneValueEvent) => void;
  event_text: (event: LoxoneTextEvent) => void;
```
Fires when Loxone value or text update events are received. Events can be filtered using the watchlist functionality (`addUuidToWatchList()` and `removeUuidFromWatchList()`). If the watchlist contains any items, events `event_value` and `event_text` events are only emitted for the UUIDs that are on the watchlist. If the watchlist is empty, events are emitted for all value and text updates.

## Disclaimer

While the author took special care to follow Loxone [official documentation](https://www.loxone.com/wp-content/uploads/datasheets/CommunicatingWithMiniserver.pdf), use this module at your own risk.

## Acknowledgements, credits

This module is heavily inspired by and based on the `node-lox-ws-api` module: https://github.com/alladdin/node-lox-ws-api
