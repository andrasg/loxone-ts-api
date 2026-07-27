import { LogLevel } from 'node-ansi-logger';

/**
 * Options for configuring the LoxoneClient
 * @param autoReconnectEnabled Whether to enable automatic reconnection
 * @param keepAliveEnabled Whether to enable keep-alive
 * @param messageLogEnabled Whether to enable message logging
 * @param logAllEvents Whether to log all events even when using a UUID watch list
 * @param logLevel The logging level for the LoxoneClient
 * @param maintainLatestEvents Whether to maintain the latest event for each state
 * @param clientUuid The UUID of the client, defaults to '11fecda8-c89a-48fb-8209-45ed851e81c7'
 */
class LoxoneClientOptions {
    public autoReconnectEnabled: boolean;
    public keepAliveEnabled: boolean;
    public messageLogEnabled: boolean;
    public logAllEvents: boolean;
    public logLevel: LogLevel;
    public maintainLatestEvents: boolean;
    public clientUuid: string;

    constructor(options: Partial<LoxoneClientOptions> = {}) {
        this.logLevel = options.logLevel ?? LogLevel.INFO;
        this.autoReconnectEnabled = options.autoReconnectEnabled ?? true;
        this.keepAliveEnabled = options.keepAliveEnabled ?? true;
        this.messageLogEnabled = options.messageLogEnabled ?? true;
        this.logAllEvents = options.logAllEvents ?? false;
        this.maintainLatestEvents = options.maintainLatestEvents ?? true;
        this.clientUuid = options.clientUuid ?? '11fecda8-c89a-48fb-8209-45ed851e81c7';
    }
}

export { LoxoneClientOptions };
