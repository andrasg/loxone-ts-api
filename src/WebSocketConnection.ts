import { WebSocket } from 'ws';
import FileMessage from './WebSocketMessages/FileMessage.js';
import TextMessage from './WebSocketMessages/TextMessage.js';
import MessageType from './WebSocketMessages/MessageType.js';
import { LoxoneEvent, LoxoneEventCtor } from './LoxoneEvents/LoxoneEvent.js';
import LoxoneWeatherEvent from './LoxoneEvents/LoxoneWeatherEvent.js';
import LoxoneDayTimerEvent from './LoxoneEvents/LoxoneDayTimerEvent.js';
import LoxoneTextEvent from './LoxoneEvents/LoxoneTextEvent.js';
import LoxoneValueEvent from './LoxoneEvents/LoxoneValueEvent.js';
import EventEmitter from 'node:events';
import ParsedHeader from './WebSocketMessages/ParsedHeader.js';
import LoxoneClientEvents from './LoxoneClientEvents.js';
import LoxoneClient from './LoxoneClient.js';
import WebSocketMessage from './WebSocketMessages/WebSocketMessage.js';
import { AnsiLogger } from 'node-ansi-logger';

// Generic pending queue entry for text/file command promises
interface PendingQueueEntry<T extends WebSocketMessage> {
    command: {
        originalCommand: string;
        encryptedCommand: string | undefined;
    };
    encrypted: boolean;
    resolve: (msg: T) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
}

class WebSocketConnection extends EventEmitter {
    private nextExpectedMessageType: MessageType = MessageType.HEADER;
    private ws: WebSocket | undefined;
    private host: string;
    private loxoneClient: LoxoneClient;

    // keepalive handling
    private keepAliveInterval: NodeJS.Timeout | undefined;
    private keepAliveEnabled = false;

    // queue of outstanding commands waiting for a text response
    private commandQueue: PendingQueueEntry<any>[] = [];

    private COMMAND_TIMEOUT: number;
    private KEEPALIVE_INTERVAL_MS = 15000;
    private KEEPALIVE_COMMAND_TIMEOUT_MS = 5000;
    private lastFilenameRequested = '';
    private log: AnsiLogger;

    constructor(loxoneClient: LoxoneClient, host: string, commandTimeout: number) {
        super();
        this.loxoneClient = loxoneClient;
        this.host = host;
        this.COMMAND_TIMEOUT = commandTimeout;
        this.log = loxoneClient.log;
    }

    async connect() {
        this.ws = new WebSocket(`ws://${this.host}/ws/rfc6455`, 'remotecontrol');
        this.ws.on('open', () => {
            this.emit('connected');
        });
        this.ws.on('close', (code: number, reason: Buffer<ArrayBufferLike>) => {
            this.cleanupAfterDisconnectOrError(`Closed with code ${code}, reason: ${reason.toString('utf8')}`);
        });
        this.ws.on('error', (error: Error) => {
            this.cleanupAfterDisconnectOrError(`Closed with error: ${error.message}`);
        });
        this.ws.on('message', this.handleMessage.bind(this));

        return new Promise((resolve, reject) => {
            this.ws?.on('open', resolve);
            this.ws?.on('error', reject);
        });
    }

    enableKeepAlive() {
        if (this.keepAliveEnabled) return;
        this.keepAliveEnabled = true;

        // send keepalive periodically; rely on sendUnencryptedTextCommand to reject on timeout
        this.keepAliveInterval = setInterval(async () => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            try {
                // send unencrypted keepalive and wait for response or timeout
                await this.sendUnencryptedTextCommand('keepalive', this.KEEPALIVE_COMMAND_TIMEOUT_MS);
                // if resolved, we'll get a keepalive header handled in handleMessage
            } catch (err) {
                this.log.error('Keepalive command failed or timed out, disconnecting', err);
                // on error (including timeout) perform disconnect procedure
                this.cleanupAfterDisconnectOrError('Keepalive command failed or timed out');
            }
        }, this.KEEPALIVE_INTERVAL_MS);
    }

    private stopKeepAlive() {
        this.keepAliveEnabled = false;
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = undefined;
        }
    }

    private cleanCommandQueueAndRejectPromises(reason: string) {
        // Reject all outstanding command promises
        const err = new Error(`Failing pending request because ${reason}`);
        for (const entry of this.commandQueue) {
            try {
                clearTimeout(entry.timer);
                entry.reject(err);
            } catch {
                // ignore individual reject errors
            }
        }
        this.commandQueue = [];
    }

    cleanupAfterDisconnectOrError(reason: string) {
        // stop keepalive timers immediately when intentionally disconnecting
        this.stopKeepAlive();
        this.cleanCommandQueueAndRejectPromises(reason);
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState !== WebSocket.CLOSED) {
                this.ws.close();
            }
            this.ws = undefined;
        }
        this.emit('disconnected', reason);
    }

    handleMessage(data: WebSocket.RawData, isBinary: boolean) {
        this.log.debug(`Received websocket message, isBinary=${isBinary}, nextExpectedMessageType=${MessageType[this.nextExpectedMessageType]}`);

        switch (this.nextExpectedMessageType) {
            case MessageType.HEADER: {
                if (!isBinary) {
                    throw new Error('Expected binary data for header');
                }
                const header = ParsedHeader.fromWsMessage(data, isBinary);
                // treat keepalive headers as a keepalive response
                if (header.messageType === MessageType.KEEPALIVE) {
                    const idx = this.findCommandQueueEntryIndex('keepalive');
                    if (idx !== -1) {
                        const entry = this.commandQueue.splice(idx, 1)[0];
                        clearTimeout(entry.timer);
                        // resolve the waiting promise with the parsed header
                        entry.resolve(header);
                        this.log.debug('  Received keepalive');
                    } else {
                        // No matching promise — emit event for consumers
                        this.emit('keepalive', header);
                    }
                }

                this.log.debug(`  Received header with message type ${MessageType[header.messageType]}, estimated = ${header.isEstimated}`);

                this.emit('header', header);
                this.nextExpectedMessageType = header.getNextExpectedMessageType();
                break;
            }
            case MessageType.TEXT: {
                if (isBinary) {
                    throw new Error('Expected non-binary data for text');
                }
                const textMessage = new TextMessage(data.toString());
                this.log.debug(`  Received text message: ${textMessage.toString()}`);
                if (!textMessage.control) {
                    this.emit('text_message', textMessage);
                    this.nextExpectedMessageType = MessageType.HEADER;
                    break;
                }
                // Try to find a matching pending command by control
                const idx = this.findCommandQueueEntryIndex(textMessage.control);
                if (idx !== -1) {
                    const entry = this.commandQueue.splice(idx, 1)[0];
                    clearTimeout(entry.timer);
                    // resolve the waiting promise with the parsed TextMessage
                    entry.resolve(textMessage);
                } else {
                    // No matching promise — emit event for consumers
                    this.emit('text_message', textMessage);
                }

                this.nextExpectedMessageType = MessageType.HEADER;
                break;
            }
            case MessageType.BINARY_FILE: {
                // TODO: Implement filename handling
                const fileMessage = new FileMessage(data, isBinary, this.lastFilenameRequested);

                // Try to find a matching pending command by control
                const idx = this.findCommandQueueEntryIndex(fileMessage.filename);
                if (idx !== -1) {
                    const entry = this.commandQueue.splice(idx, 1)[0];
                    clearTimeout(entry.timer);
                    // resolve the waiting promise with the parsed FileMessage
                    entry.resolve(fileMessage);
                } else {
                    // No matching promise — emit event for consumers
                    this.emit('file_message', fileMessage);
                }

                this.nextExpectedMessageType = MessageType.HEADER;
                break;
            }
            case MessageType.ETABLE_VALUES: {
                const events = this.parseEventTables(LoxoneValueEvent, data, isBinary);
                this.log.debug(`Received ${events.length} value events`);
                this.emit(LoxoneValueEvent.eventName, events);
                this.nextExpectedMessageType = MessageType.HEADER;
                break;
            }
            case MessageType.ETABLE_TEXT: {
                const events = this.parseEventTables(LoxoneTextEvent, data, isBinary);
                this.log.debug(`Received ${events.length} text events`);
                this.emit(LoxoneTextEvent.eventName, events);
                this.nextExpectedMessageType = MessageType.HEADER;
                break;
            }
            case MessageType.ETABLE_DAYTIMER: {
                const events = this.parseEventTables(LoxoneDayTimerEvent, data, isBinary);
                this.log.debug(`Received ${events.length} day timer events`);
                this.emit(LoxoneDayTimerEvent.eventName, events);
                this.nextExpectedMessageType = MessageType.HEADER;
                break;
            }
            case MessageType.ETABLE_WEATHER: {
                const events = this.parseEventTables(LoxoneWeatherEvent, data, isBinary);
                this.emit(LoxoneWeatherEvent.eventName, events);
                this.nextExpectedMessageType = MessageType.HEADER;
                break;
            }
        }
    }

    /**
     * Parses event tables from the WebSocket raw data.
     * @param ctor - The constructor of the event type.
     * @param raw - The raw WebSocket data.
     * @param isBinary - Whether the data is binary.
     * @returns An array of parsed event objects.
     */
    private parseEventTables<T extends LoxoneEvent>(ctor: LoxoneEventCtor<T>, raw: WebSocket.RawData, isBinary: boolean): T[] {
        if (!isBinary) throw new Error('Expected binary data for event table');
        if (!Buffer.isBuffer(raw)) {
            throw new Error('data is not buffer');
        }

        // loop through raw data
        const items: T[] = [];
        let idx = 0;
        while (idx < raw.length) {
            const it = new ctor(raw, idx);
            items.push(it);
            idx += it.data_length();
        }
        return items;
    }

    async sendEncryptedTextCommand(command: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
        return this.sendCommand<TextMessage>(command, true, timeoutMs);
    }

    async sendUnencryptedTextCommand(command: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
        return this.sendCommand<TextMessage>(command, false, timeoutMs);
    }

    async sendUnencryptedFileCommand(filename: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<FileMessage> {
        this.lastFilenameRequested = filename;
        return this.sendCommand<FileMessage>(filename, false, timeoutMs);
    }

    async sendCommand<T extends WebSocketMessage>(command: string, encrypt = false, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<T> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Cannot send websocket command, readystate is not open');
        }

        return new Promise<T>((resolve, reject) => {
            // create timeout to reject the promise if no matching text arrives
            const timer = setTimeout(() => {
                // remove from queue if still present
                const i = this.findCommandQueueEntryIndex(command);
                if (i !== -1) this.commandQueue.splice(i, 1);
                reject(new Error(`No answer for command=${command} after ${timeoutMs}ms`));
            }, timeoutMs);

            const commandDefinition = {
                originalCommand: command,
                encryptedCommand: encrypt ? this.loxoneClient.auth.commandEncryption.getEncryptedCommand(command) : undefined,
            };

            // enqueue the pending command
            this.commandQueue.push({
                command: commandDefinition,
                encrypted: encrypt,
                resolve,
                reject,
                timer,
            });

            // finally, send the command string over the websocket
            try {
                if (commandDefinition.encryptedCommand) {
                    this.log.debug(`Sending encrypted command ${command} (${commandDefinition.encryptedCommand})`);
                    this.ws?.send(commandDefinition.encryptedCommand);
                } else {
                    this.log.debug(`Sending command ${command}`);
                    this.ws?.send(command);
                }
            } catch (err) {
                // remove queue entry & clear timer
                const i = this.findCommandQueueEntryIndex(command);
                if (i !== -1) {
                    const entry = this.commandQueue.splice(i, 1)[0];
                    clearTimeout(entry.timer);
                }
                reject(err);
            }
        });
    }

    private findCommandQueueEntryIndex(command: string): number {
        const i = this.commandQueue.findIndex(
            (q) =>
                (q.command.encryptedCommand && decodeURIComponent(q.command.encryptedCommand) === command) ||
                (q.command.encryptedCommand && decodeURIComponent(q.command.encryptedCommand).replace('jdev', 'dev') === command) ||
                q.command.originalCommand === command ||
                q.command.originalCommand.replace('jdev', 'dev') === command,
        );
        return i;
    }

    override on<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
        return super.on(event as string, listener as (...args: any[]) => void);
    }

    override once<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
        return super.once(event as string, listener as (...args: any[]) => void);
    }

    override off<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
        return super.off(event as string, listener as (...args: any[]) => void);
    }

    override emit<K extends keyof LoxoneClientEvents>(event: K, ...args: Parameters<LoxoneClientEvents[K]>): boolean {
        return super.emit(event as string, ...args);
    }
}

export default WebSocketConnection;
