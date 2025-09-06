import { LogLevel } from "node-ansi-logger";

/**
 * Options for configuring the LoxoneClient
 * @param autoReconnectEnabled Whether to enable automatic reconnection
 * @param keepAliveEnabled Whether to enable keep-alive
 * @param messageLogEnabled Whether to enable message logging
 */
class LoxoneClientOptions {
    public autoReconnectEnabled: boolean;
    public keepAliveEnabled: boolean;
    public messageLogEnabled: boolean;
    public logAllEvents: boolean;
    public logLevel: LogLevel;

    constructor(options: Partial<LoxoneClientOptions> = {}) {
        this.logLevel = options.logLevel ?? LogLevel.INFO;
        this.autoReconnectEnabled = options.autoReconnectEnabled ?? true;
        this.keepAliveEnabled = options.keepAliveEnabled ?? true;
        this.messageLogEnabled = options.messageLogEnabled ?? true;
        this.logAllEvents = options.logAllEvents ?? false;
    }
}

export { LoxoneClientOptions };
