import EventEmitter from 'node:events';
import LoxoneClientEvents from './LoxoneClientEvents.js';
import FileMessage from './WebSocketMessages/FileMessage.js';
import WebSocketConnection from './WebSocketConnection.js';
import Auth from './Auth/Auth.js';
import TextMessage from './WebSocketMessages/TextMessage.js';
import LoxoneClientState from './LoxoneClientState.js';
import AutoReconnect from './AutoReconnect.js';
import { AnsiLogger, LogLevel, nf, TimestampFormat, YELLOW } from 'node-ansi-logger';
import { exit } from 'node:process';
import LoxoneValueEvent from './LoxoneEvents/LoxoneValueEvent.js';
import LoxoneTextEvent from './LoxoneEvents/LoxoneTextEvent.js';
import { LoxoneClientOptions } from './LoxoneClientOptions.js';

class LoxoneClient extends EventEmitter {
    private connection: WebSocketConnection;
    private wired = false;
    auth: Auth;
    host: string;
    isGen2 = false;
    keepAliveEnabled = true;
    private COMMAND_TIMEOUT = 15000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structureFile: any;
    state: LoxoneClientState = LoxoneClientState.disconnected;
    autoReconnect: AutoReconnect;
    log = new AnsiLogger({ logName: LoxoneClient.name, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.INFO });
    private uuidWatchlist = new Set<string>();

    /**
     * A wrapper class for communicating with and controlling a Loxone Miniserver
     * @param host Loxone hostname or IP
     * @param username Username to be used
     * @param password Password for the user
     * @param keepAliveEnabed (optional) whether to enable keepalive
     */
    constructor(host: string, username: string, password: string, clientOptions: Partial<LoxoneClientOptions> | LoxoneClientOptions = new LoxoneClientOptions()) {
        super();
        const options = clientOptions instanceof LoxoneClientOptions ? clientOptions : new LoxoneClientOptions(clientOptions);

        this.connection = new WebSocketConnection(this, host, this.COMMAND_TIMEOUT, options.messageLogEnabled);
        this.auth = new Auth(this.log, this.connection, host, username, password);
        this.host = host;
        this.autoReconnect = new AutoReconnect(this, this.log, options.autoReconnectEnabled);
        this.keepAliveEnabled = options.keepAliveEnabled;
    }

    /**
     * Initiates connection and triggers authentication
     */
    async connect(existingToken?: string) {
        if (this.state !== LoxoneClientState.disconnected && this.state !== LoxoneClientState.error) {
            this.log.warn('Not in disconnected or error state, ignoring connect call');
            return;
        }
        if (this.autoReconnect.autoReconnectingInProgress) {
            this.setState(LoxoneClientState.reconnecting);
        } else {
            this.setState(LoxoneClientState.connecting);
        }

        try {
            // 1. pass through events
            this.wireUpEvents();

            // 2. check version and https
            await this.checkVersion();

            // 3. create websocket connection and connect
            await this.connection?.connect();
            this.log.info('Connected');
            this.setState(LoxoneClientState.connected);

            // 4. perform auth
            this.setState(LoxoneClientState.authenticating);
            await this.auth.authenticate(existingToken);
            this.setState(LoxoneClientState.authenticated);
            this.log.info('Authenticated');
            this.emit('authenticated');

            // 5. enable keep-alive
            if (this.keepAliveEnabled) {
                this.connection?.enableKeepAlive();
            }
            this.setState(LoxoneClientState.ready);
            this.log.info('LoxoneClient is ready to receive commands');
            this.emit('ready');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`Could not connect: ${error.message} - ${error.cause}`, error);
            this.setState(LoxoneClientState.error);
            await this.autoReconnect.startAutoReconnect(existingToken);
        }
    }

    /**
     * Gets the Loxone structure file
     * @returns the Loxone LoxAPP3.json file
     */
    async getStructureFile() {
        try {
            const structureFileMessage = await this.sendFileCommand('data/LoxAPP3.json');
            this.structureFile = structureFileMessage.data;
            this.log.info(`Received structure file with last modified: ${this.structureFile.lastModified}`);
            return this.structureFile;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`Could not get structure file: ${error.message} - ${error.cause}`, error);
            throw new Error('Could not get structure file', { cause: error as Error });
        }
    }

    /**
     * Enables binary streaming of value and text updates
     */
    async enableUpdates() {
        try {
            this.ensureGoodState('Not connected and authenticated, cannot enable updates');
            await this.connection.sendUnencryptedTextCommand('jdev/sps/enablebinstatusupdate');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`Could not enable updates: ${error.message} - ${error.cause}`, error);
            throw new Error('Could not enable updates', { cause: error as Error });
        }
    }

    /**
     * Disconnects the client, optionally preserving the token
     * @param preserveToken Whether to preserve the token after disconnecting or not, if omitted, defaults to false
     */
    async disconnect(preserveToken = false) {
        try {
            this.setState(LoxoneClientState.disconnecting);

            this.autoReconnect.disableAutoReconnect();

            // stop token refresh timer
            this.auth.tokenHandler.clearScheduledRefresh();

            // kill (free up) token
            if (!preserveToken) {
                await this.auth.tokenHandler.killToken();
            }

            // disconnect websocket
            this.connection?.cleanupAfterDisconnectOrError('Disconnect initiated');
            this.setState(LoxoneClientState.disconnected);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`Error while disconnecting: ${error.message} - ${error.cause}`, error);
        }
    }

    /**
     * Checks whether the token used is still valid
     */
    async checkToken(token?: string) {
        try {
            this.ensureGoodState('Not connected and authenticated, cannot check token');
            await this.auth.tokenHandler.checkToken(token);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`Could not check token: ${error.message} - ${error.cause}`, error);
            throw new Error('Could not check token', { cause: error as Error });
        }
    }

    /**
     * Refreshes the token if it is still valid. Acquires a new token if token is not valid any more
     */
    async refreshToken() {
        try {
            this.ensureGoodState('Not connected and authenticated, cannot refresh token');
            await this.auth.tokenHandler.refreshToken();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`Could not refresh token: ${error.message} - ${error.cause}`, error);
            throw new Error('Could not refresh token', { cause: error as Error });
        }
    }

    /**
     * Sends a text command to the Loxone Miniserver. If a Miniserver Gen.1 is used, command encryption will be used.
     * @param command The command to send
     * @param timeoutOverride (optional) timeoutoverride for this command
     * @returns The response from the Loxone Miniserver
     */
    async sendTextCommand(command: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<TextMessage> {
        try {
            this.ensureGoodState('Not connected and authenticated, cannot send command');
            const encrypted = !this.isGen2;
            return await this.connection?.sendCommand(command, encrypted, timeoutOverride);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`${command} - Could not send text command: ${error.message} - ${error.cause}`, error);
            throw new Error(`${command} - Could not send text command`, { cause: error as Error });
        }
    }

    /**
     * Gets a file from the Loxone Miniserver.
     * @param filename Name of the file to retrieve
     * @param timeoutOverride (optional) timeoutoverride for this command
     * @returns The file contents as a FileMessage
     */
    async sendFileCommand(filename: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<FileMessage> {
        try {
            this.ensureGoodState('Not connected and authenticated, cannot send command');
            return await this.connection?.sendUnencryptedFileCommand(filename, timeoutOverride);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`${filename} - Could not send file command: ${error.message} - ${error.cause}`, error);
            throw new Error(`${filename} - Could not send file command`, { cause: error as Error });
        }
    }

    /**
     * Executes a command on the control identified by the UUID.
     * @param uuid The UUID of the control
     * @param command The command to execute
     * @param timeoutOverride (optional) timeoutoverride for this command
     * @returns The response from the Loxone Miniserver
     */
    async control(uuid: string, command: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<TextMessage> {
        try {
            this.ensureGoodState('Not connected and authenticated, cannot send command');
            const encrypted = !this.isGen2;
            const fullCommand = `jdev/sps/io/${uuid}/${command}`;
            const response = await this.connection.sendCommand<TextMessage>(fullCommand, encrypted, timeoutOverride);
            if (response.code === 404) this.log.error(`Loxone control '${uuid}' not found`);
            else if (response.code !== 200) this.log.error(`${uuid}/${command} - unknown error, response was not 200 OK, but ${response.code}`);
            if (response.value === '0') this.log.error(`Loxone command '${command}' invalid, response indicates unsuccessful execution (response.value = 0)`);
            return response;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.log.error(`${uuid}/${command} - Could not execute control command: ${error.message} - ${error.cause}`, error);
            throw new Error(`${uuid}/${command} - Could not execute control command`, { cause: error as Error });
        }
    }

    /**
     * Sets the log level for the client.
     * @param level The log level to set
     */
    setLogLevel(level: LogLevel) {
        this.log.logLevel = level;
    }

    private wireUpEvents() {
        if (this.wired) return;

        this.connection.on('disconnected', (reason: string) => {
            this.log.warn(`Disconnected: ${reason}`);
            if (this.state !== LoxoneClientState.error) this.setState(LoxoneClientState.disconnected);
        });
        this.connection.on('error', (error: Error) => {
            this.log.error(`Connection error: ${error.message}`, error);
            this.setState(LoxoneClientState.error);
        });

        if (this.autoReconnect.autoReconnectEnabled) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            this.connection.on('disconnected', async (reason: string) => {
                try {
                    await this.autoReconnect.startAutoReconnect();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    this.log.error(`Failed to start auto reconnect: ${error?.message}`, error);
                }
            });
            this.connection.on('connected', async () => {
                try {
                    this.autoReconnect.stopAutoReconnect();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    this.log.error(`Failed to stop auto reconnect: ${error?.message}`, error);
                }
            });
        }

        // forward events from the underlying connection to this client
        const EVENTS = [
            'connected',
            'disconnected',
            'error',
            'text_message',
            'file_message',
            'event_table_day_timer',
            'event_table_values',
            'event_table_text',
            'event_table_weather',
        ];

        for (const event of EVENTS) {
            // forward any args from the connection to the client emitter
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.connection.on(event as keyof LoxoneClientEvents, (...args: any[]) => this.emit(event as keyof LoxoneClientEvents, ...(args as any)));
        }

        this.connection.on('event_table_values', (eventTable: LoxoneValueEvent[]) => {
            if (this.uuidWatchlist.size > 0) {
                eventTable = eventTable.filter((event) => this.uuidWatchlist.has(event.uuid.toString()));
            }
            eventTable.forEach((event) => {
                this.emit('event_value', event);
            });
        });
        this.connection.on('event_table_text', (eventTable: LoxoneTextEvent[]) => {
            if (this.uuidWatchlist.size > 0) {
                eventTable = eventTable.filter((event) => this.uuidWatchlist.has(event.uuid.toString()));
            }
            eventTable.forEach((event) => {
                this.emit('event_text', event);
            });
        });

        this.wired = true;
    }

    /**
     * Adds one or more UUIDs to the watch list. Value and text events will only be emitted for these UUIDs.
     * If the watchlist is empty, all events will be emitted.
     * @param uuid The UUID or array of UUIDs to add
     */
    addUuidToWatchList(uuid: string | string[]) {
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => this.uuidWatchlist.add(id));
        } else {
            this.uuidWatchlist.add(uuid);
        }
    }

    /**
     * Removes one or more UUIDs from the watch list.
     * @param uuid The UUID or array of UUIDs to remove
     */
    removeUuidFromWatchList(uuid: string | string[]) {
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => this.uuidWatchlist.delete(id));
        } else {
            this.uuidWatchlist.delete(uuid);
        }
    }

    private async checkVersion() {
        const response = await fetch('http://' + this.host + '/jdev/cfg/apiKey');
        if (response.status === 503) {
            throw new Error('Miniserver is rebooting');
        }
        if (!response.ok) {
            this.log.error(`Failed to check version: ${response.status}`, response);
            throw new Error('Failed to check version');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await response.json();
        const jsonString = data.LL.value.replace(/'/g, '"');
        const dataJson = JSON.parse(jsonString);
        const version = dataJson.version;
        const versionParts = version.split('.');
        if (versionParts[0] < 11 || (versionParts[0] === 11 && versionParts[1] < 2)) {
            this.log.error(`Unsupported Loxone firmware version, needs to be at least 11.2: ${version}`);
            exit(1);
        }

        if (dataJson.httpsStatus) {
            this.isGen2 = true;
        }
    }

    private ensureGoodState(errorReason: string) {
        if (this.state !== LoxoneClientState.ready) {
            throw new Error(`Client is not in an expected state - ${errorReason}`);
        }
    }

    private setState(state: LoxoneClientState) {
        if (this.state !== state) {
            this.state = state;
            this.log.info(`State changed to: ${YELLOW}${LoxoneClientState[state]}${nf}`);
            this.emit('stateChanged', LoxoneClientState[state]);
        }
    }

    // Typed emitting of events
    override on<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return super.on(event as string, listener as (...args: any[]) => void);
    }

    override once<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return super.once(event as string, listener as (...args: any[]) => void);
    }

    override off<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return super.off(event as string, listener as (...args: any[]) => void);
    }

    override emit<K extends keyof LoxoneClientEvents>(event: K, ...args: Parameters<LoxoneClientEvents[K]>): boolean {
        return super.emit(event as string, ...args);
    }
}

export default LoxoneClient;
