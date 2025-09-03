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

    constructor(options: Partial<LoxoneClientOptions> = {}) {
        this.autoReconnectEnabled = options.autoReconnectEnabled ?? true;
        this.keepAliveEnabled = options.keepAliveEnabled ?? true;
        this.messageLogEnabled = options.messageLogEnabled ?? true;
    }
}

export { LoxoneClientOptions };
