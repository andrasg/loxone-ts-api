import type { AnsiLogger } from "node-ansi-logger";
import type LoxoneClient from "../LoxoneClient.js";

class AutoReconnect {
  autoReconnectEnabled: boolean;
  autoReconnectingInProgress = false;
  reconnectTimeout: NodeJS.Timeout | undefined;
  // resolve function for the pending sleep so we can cancel it
  client: LoxoneClient;
  log: AnsiLogger;
  reconnectResolve: undefined | ((value: boolean | PromiseLike<boolean>) => void);
  reconnectDelayMs = 1000;

  constructor(client: LoxoneClient, log: AnsiLogger, autoReconnectEnabled: boolean) {
    this.autoReconnectEnabled = autoReconnectEnabled;
    this.client = client;
    this.log = log;
  }

  async startAutoReconnect(existingToken?: string): Promise<void> {
    if (this.autoReconnectingInProgress) return;
    if (!this.autoReconnectEnabled) return;

    this.autoReconnectingInProgress = true;

    // run a cancelable loop that attempts to reconnect every 30s
    while (this.autoReconnectEnabled && this.autoReconnectingInProgress) {
      const delay = this.getNextReconnectDelay();
      this.log.info(`Waiting ${delay / 1000} seconds before reconnecting`);

      // allow aborting
      const shouldReturn = await new Promise<boolean>((resolve) => {
        this.reconnectResolve = resolve;
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = undefined;
          this.reconnectResolve = undefined;
          resolve(false);
        }, delay);
      });
      if (shouldReturn) return;

      this.log.info(`Reconnecting after disconnect...`);
      try {
        await this.client.connect(existingToken);
      } catch (err) {
        this.log.error(`Reconnect attempt failed: ${String(err)}`, String(err));
      }
    }
  }

  private getNextReconnectDelay(): number {
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30000);
    return delay;
  }

  stopAutoReconnect(): void {
    this.autoReconnectingInProgress = false;
    // reset delay
    this.reconnectDelayMs = 1000;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    // if a sleep is pending, resolve it so the loop can exit promptly
    if (this.reconnectResolve) {
      this.log.info("Stopping pending reconnect");
      try {
        this.reconnectResolve(true);
      } catch {
        /* ignore */
      }
      this.reconnectResolve = undefined;
    }
  }

  disableAutoReconnect(): void {
    this.autoReconnectEnabled = false;
    this.stopAutoReconnect();
  }
}

export default AutoReconnect;
