import type LoxoneClientEvents from "./LoxoneClientEvents.js";
import type FileMessage from "./WebSocketMessages/FileMessage.js";
import WebSocketConnection from "./Services/WebSocketConnection.js";
import Auth from "./Services/Auth.js";
import type TextMessage from "./WebSocketMessages/TextMessage.js";
import LoxoneClientState from "./LoxoneClientState.js";
import AutoReconnect from "./Services/AutoReconnect.js";
import { AnsiLogger, LogLevel, nf, TimestampFormat, YELLOW } from "node-ansi-logger";
import { exit } from "node:process";
import LoxoneValueEvent from "./LoxoneEvents/LoxoneValueEvent.js";
import LoxoneTextEvent from "./LoxoneEvents/LoxoneTextEvent.js";
import { LoxoneClientOptions } from "./LoxoneClientOptions.js";
import Control from "./Structure/Control.js";
import State from "./Structure/State.js";
import Room from "./Structure/Room.js";
import LoxoneEnrichableEvent from "./LoxoneEvents/LoxoneEnrichableEvent.js";
import UUID from "./WebSocketMessages/UUID.js";
import LoxoneWeatherEvent from "./LoxoneEvents/LoxoneWeatherEvent.js";
import LoxoneDayTimerEvent from "./LoxoneEvents/LoxoneDayTimerEvent.js";
import type { LoxoneEvent } from "./LoxoneEvents/LoxoneEvent.js";
import { EventEmitter } from "node:events";
import { resolveBaseUrl } from "./Services/AddressResolver.js";
import { describeError } from "./Utils/ErrorFormatter.js";

type LogLevelName = "none" | "fatal" | "error" | "warn" | "notice" | "info" | "debug";

class LoxoneClient extends EventEmitter {
  private readonly webSocketConnection: WebSocketConnection;
  readonly auth: Auth;
  private readonly address: string;
  private baseUrl: URL | undefined;
  private readonly COMMAND_TIMEOUT = 15000;
  private readonly log: AnsiLogger;
  private readonly uuidWatchlist = new Set<string>();
  private isGen2 = false;
  private wired = false;
  private _state: LoxoneClientState = LoxoneClientState.disconnected;
  private isStructureFileParsed = false;
  private autoReconnect: AutoReconnect;
  private enableUpdatesRequested = false;

  // oxlint-disable-next-line typescript/no-explicit-any
  public structureFile: any = undefined;
  public options: LoxoneClientOptions;

  /**
   * Gets the current state of the Loxone client
   * @returns {LoxoneClientState} The current state of the Loxone client
   */
  public get state(): LoxoneClientState {
    return this._state;
  }
  /**
   * A mapping of control UUIDs to Controls
   */
  public readonly controls = new Map<string, Control>();
  /**
   * A mapping of state UUIDs to States
   */
  public readonly states = new Map<string, State>();
  /**
   * A mapping of room UUIDs to Rooms
   */
  public readonly rooms = new Map<string, Room>();

  /**
   * A wrapper class for communicating with and controlling a Loxone Miniserver
   * @param {string} address Miniserver serial number (MAC address), IP address, hostname or base URL.
   * A serial number is resolved via Remote Connect, everything else without a scheme defaults to "http://".
   * @param {string} username Username to be used
   * @param {string} password Password for the user
   * @param {Partial<LoxoneClientOptions> | LoxoneClientOptions} clientOptions (optional) client options for configuring the Loxone client
   */
  constructor(
    address: string,
    username: string,
    password: string,
    clientOptions: Partial<LoxoneClientOptions> | LoxoneClientOptions = new LoxoneClientOptions(),
  ) {
    super();
    const options =
      clientOptions instanceof LoxoneClientOptions
        ? clientOptions
        : new LoxoneClientOptions(clientOptions);

    this.log = new AnsiLogger({
      logName: LoxoneClient.name,
      logTimestampFormat: TimestampFormat.TIME_MILLIS,
      logLevel: options.logLevel,
    });
    this.address = address;
    this.webSocketConnection = new WebSocketConnection(
      this,
      this.log,
      this.COMMAND_TIMEOUT,
      options.messageLogEnabled,
    );
    this.auth = new Auth(this.log, this.webSocketConnection, username, password, options);
    this.autoReconnect = new AutoReconnect(this, this.log, options.autoReconnectEnabled);
    this.options = options;

    this.rooms.set(UUID.empty.stringValue, new Room(UUID.empty, "<N/A>"));
  }

  /**
   * Initiates connection and triggers authentication
   * @param {string} existingToken (optional) previously issued token to authenticate with
   */
  async connect(existingToken?: string): Promise<void> {
    if (this._state !== LoxoneClientState.disconnected && this._state !== LoxoneClientState.error) {
      this.log.warn("Not in disconnected or error state, ignoring connect call");
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

      // 2. resolve the configured address into a base URL
      this.baseUrl = await resolveBaseUrl(this.address);
      this.log.info(`Resolved address '${this.address}' to ${this.baseUrl.origin}`);

      // 3. check version and https
      await this.checkVersion();

      // 4. create websocket connection and connect
      await this.webSocketConnection?.connect(this.baseUrl);
      this.log.info("Connected");
      this.setState(LoxoneClientState.connected);

      // 5. perform auth
      this.setState(LoxoneClientState.authenticating);
      await this.auth.authenticate(this.baseUrl, existingToken);
      this.setState(LoxoneClientState.authenticated);
      this.log.info("Authenticated");
      this.emit("authenticated");

      // 6. enable keep-alive
      if (this.options.keepAliveEnabled) {
        this.webSocketConnection?.enableKeepAlive();
      }

      // 7. we're ready
      this.setState(LoxoneClientState.ready);
      this.log.info("LoxoneClient is ready to receive commands");
      this.emit("ready");

      // 7. re-enable updates if this is a reconnect and they were enabled before
      if (this.enableUpdatesRequested) {
        this.log.info("Re-enabling binary updates after reconnect");
        await this.enableUpdates();
      }
    } catch (error: unknown) {
      this.log.error(`Could not connect: ${describeError(error)}`, error);
      this.setState(LoxoneClientState.error);
      await this.autoReconnect.startAutoReconnect(existingToken);
    }
  }

  /**
   * Gets the Loxone structure file
   * @returns {Promise<any>} the Loxone LoxAPP3.json file
   */
  // oxlint-disable-next-line typescript/no-explicit-any
  async getStructureFile(): Promise<any> {
    try {
      const structureFileMessage = await this.sendFileCommand("data/LoxAPP3.json");
      this.structureFile = structureFileMessage.data;
      this.log.info(
        `Received structure file with last modified: ${this.structureFile.lastModified}`,
      );
      return this.structureFile;
    } catch (error: unknown) {
      this.log.error(`Could not get structure file: ${describeError(error)}`, error);
      throw new Error(`Could not get structure file: ${describeError(error)}`, { cause: error });
    }
  }

  /**
   * Enables binary streaming of value and text updates
   */
  async enableUpdates(): Promise<void> {
    try {
      this.ensureReadyState("Not connected and authenticated, cannot enable updates");
      this.enableUpdatesRequested = true;
      await this.webSocketConnection.sendUnencryptedTextCommand("jdev/sps/enablebinstatusupdate");
    } catch (error: unknown) {
      this.log.error(`Could not enable updates: ${describeError(error)}`, error);
      throw new Error(`Could not enable updates: ${describeError(error)}`, { cause: error });
    }
  }

  /**
   * Disconnects the client, optionally preserving the token
   * @param {boolean} preserveToken Whether to preserve the token after disconnecting or not, if omitted, defaults to false
   */
  async disconnect(preserveToken = false): Promise<void> {
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
      this.webSocketConnection?.cleanupAfterDisconnectOrError("Disconnect initiated");
      this.setState(LoxoneClientState.disconnected);
    } catch (error: unknown) {
      this.log.error(`Error while disconnecting: ${describeError(error)}`, error);
    }
  }

  /**
   * Checks whether the token used is still valid
   * @param {string} token (optional) token to check, defaults to the currently held token
   */
  async checkToken(token?: string): Promise<void> {
    try {
      this.ensureReadyState("Not connected and authenticated, cannot check token");
      await this.auth.tokenHandler.checkToken(token);
    } catch (error: unknown) {
      this.log.error(`Could not check token: ${describeError(error)}`, error);
      throw new Error(`Could not check token: ${describeError(error)}`, { cause: error });
    }
  }

  /**
   * Refreshes the token if it is still valid. Acquires a new token if token is not valid any more
   */
  async refreshToken(): Promise<void> {
    try {
      this.ensureReadyState("Not connected and authenticated, cannot refresh token");
      await this.auth.tokenHandler.refreshToken();
    } catch (error: unknown) {
      this.log.error(`Could not refresh token: ${describeError(error)}`, error);
      throw new Error(`Could not refresh token: ${describeError(error)}`, { cause: error });
    }
  }

  /**
   * Sends a text command to the Loxone Miniserver. If a Miniserver Gen.1 is used, command encryption will be used.
   * @param {string} command The command to send
   * @param {number} timeoutOverride (optional) timeoutoverride for this command
   * @returns {Promise<TextMessage>} The response from the Loxone Miniserver
   */
  async sendTextCommand(
    command: string,
    timeoutOverride = this.COMMAND_TIMEOUT,
  ): Promise<TextMessage> {
    try {
      this.ensureReadyState("Not connected and authenticated, cannot send command");
      const encrypted = !this.isGen2;
      return await this.webSocketConnection?.sendCommand(command, encrypted, timeoutOverride);
    } catch (error: unknown) {
      this.log.error(`${command} - Could not send text command: ${describeError(error)}`, error);
      throw new Error(`${command} - Could not send text command: ${describeError(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Gets a file from the Loxone Miniserver.
   * @param {string} filename Name of the file to retrieve
   * @param {number} timeoutOverride (optional) timeoutoverride for this command
   * @returns {Promise<FileMessage>} The file contents as a FileMessage
   */
  async sendFileCommand(
    filename: string,
    timeoutOverride = this.COMMAND_TIMEOUT,
  ): Promise<FileMessage> {
    try {
      this.ensureReadyState("Not connected and authenticated, cannot send command");
      return await this.webSocketConnection?.sendUnencryptedFileCommand(filename, timeoutOverride);
    } catch (error: unknown) {
      this.log.error(`${filename} - Could not send file command: ${describeError(error)}`, error);
      throw new Error(`${filename} - Could not send file command: ${describeError(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Executes a command on the control identified by the UUID.
   * @param {string | UUID} uuid The UUID of the control
   * @param {string} command The command to execute
   * @param {number} timeoutOverride (optional) timeoutoverride for this command
   * @returns {Promise<TextMessage>} The response from the Loxone Miniserver
   */
  async control(
    uuid: string | UUID,
    command: string,
    timeoutOverride = this.COMMAND_TIMEOUT,
  ): Promise<TextMessage> {
    const controlUuid = uuid instanceof UUID ? uuid.stringValue : uuid;
    try {
      this.ensureReadyState("Not connected and authenticated, cannot send command");
      if (this.isStructureFileParsed && !this.controls.has(controlUuid)) {
        this.log.warn(
          `Control UUID '${controlUuid}' is not present in the structure file, control command will likely fail`,
        );
      }

      const encrypted = !this.isGen2;
      const fullCommand = `jdev/sps/io/${controlUuid}/${command}`;
      const response = await this.webSocketConnection.sendCommand<TextMessage>(
        fullCommand,
        encrypted,
        timeoutOverride,
      );
      if (response.code === 404) this.log.error(`Loxone control '${controlUuid}' not found`);
      else if (response.code !== 200)
        this.log.error(
          `${controlUuid}/${command} - unknown error, response was not 200 OK, but ${response.code}`,
        );
      if (response.value === "0")
        this.log.error(
          `Loxone command '${command}' invalid, response indicates unsuccessful execution (response.value = 0)`,
        );
      return response;
    } catch (error: unknown) {
      this.log.error(
        `${controlUuid}/${command} - Could not execute control command: ${describeError(error)}`,
        error,
      );
      throw new Error(
        `${controlUuid}/${command} - Could not execute control command: ${describeError(error)}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Parses the structure file and extracts relevant information. After calling this event, emitted event updates will
   * contain enriched information about the room, control, and state names.
   */
  async parseStructureFile(): Promise<void> {
    if (!this.structureFile) {
      this.log.warn(`No structure file loaded, trying to get it`);
      await this.getStructureFile();
    }

    this.log.info(`Parsing structure file...`);

    this.log.info(`Processing rooms...`);
    for (const uuid in this.structureFile.rooms) {
      const room = this.structureFile.rooms[uuid];
      this.log.debug(`Found Loxone room with UUID ${uuid}, name ${room.name}`);
      this.rooms.set(uuid, new Room(UUID.fromString(uuid), room.name));
    }
    this.log.info(`Found ${this.rooms.size} rooms in the structure file.`);

    // create a map of potential event UUIDs to room and control names with state names
    for (const controlUuidString in this.structureFile.controls) {
      const controlSection = this.structureFile.controls[controlUuidString];
      if (!controlSection.type || controlSection.type === "SystemScheme") continue;
      // lookup room
      let room;
      if (controlSection.room) {
        room = this.rooms.get(controlSection.room);
      } else {
        room = this.rooms.get(UUID.empty.stringValue);
      }
      if (!room) throw new Error(`Could not find room with UUID ${controlSection.room}`);
      // create control
      const control = new Control(controlUuidString, controlSection, room);
      this.controls.set(controlUuidString, control);
      for (const stateKey in controlSection.states) {
        const stateUuidString = controlSection.states[stateKey];
        const stateUuid = UUID.fromString(stateUuidString);
        const state = new State(stateUuid, stateKey, control);
        this.states.set(stateUuidString, state);
        control.addState(state);
      }
      // parse subcontrols, if any
      if (controlSection.subControls) {
        for (const subControlUuidString in controlSection.subControls) {
          const subControlSection = controlSection.subControls[subControlUuidString];
          const subControl = new Control(subControlUuidString, subControlSection, room, control);
          this.controls.set(subControlUuidString, subControl);
          for (const stateKey in subControlSection.states) {
            const stateUuidString = subControlSection.states[stateKey];
            const stateUuid = UUID.fromString(stateUuidString);
            const state = new State(stateUuid, stateKey, subControl);
            this.states.set(stateUuidString, state);
            subControl.addState(state);
          }
        }
      }
    }
    this.log.info(`Found ${this.controls.size} controls in the structure file.`);
    this.log.info(`Found ${this.states.size} states in the structure file.`);

    this.isStructureFileParsed = true;
  }

  /**
   * Sets the log level for the client.
   * @param {LogLevel | LogLevelName} level The log level to set
   */
  setLogLevel(level: LogLevel | LogLevelName): void {
    if (typeof level === "string") {
      const normalizedLevel = level.trim().toUpperCase();
      const logLevelMap: Record<string, LogLevel> = {
        NONE: LogLevel.NONE,
        NOTICE: LogLevel.NOTICE,
        DEBUG: LogLevel.DEBUG,
        INFO: LogLevel.INFO,
        WARN: LogLevel.WARN,
        ERROR: LogLevel.ERROR,
        FATAL: LogLevel.FATAL,
      };
      const mappedLevel = logLevelMap[normalizedLevel];
      if (mappedLevel === undefined) {
        throw new Error(`Invalid log level: ${level}`);
      }
      this.log.logLevel = mappedLevel;
      return;
    }

    this.log.logLevel = level;
  }

  private wireUpEvents(): void {
    if (this.wired) return;

    this.webSocketConnection.on("disconnected", (reason: string) => {
      this.log.warn(`Disconnected: ${reason}`);
      if (this._state !== LoxoneClientState.error) this.setState(LoxoneClientState.disconnected);
    });
    this.webSocketConnection.on("error", (error: Error) => {
      this.log.error(`Connection error: ${error.message}`, error);
      this.setState(LoxoneClientState.error);
    });

    if (this.autoReconnect.autoReconnectEnabled) {
      this.webSocketConnection.on("disconnected", () => {
        void this.autoReconnect.startAutoReconnect().catch((error: unknown) => {
          this.log.error(`Failed to start auto reconnect: ${describeError(error)}`, error);
        });
      });
      this.webSocketConnection.on("connected", () => {
        try {
          this.autoReconnect.stopAutoReconnect();
        } catch (error: unknown) {
          this.log.error(`Failed to stop auto reconnect: ${describeError(error)}`, error);
        }
      });
    }

    // forward events from the underlying connection to this client
    this.webSocketConnection.on("connected", () => this.emit("connected"));
    this.webSocketConnection.on("disconnected", (reason) => this.emit("disconnected", reason));
    this.webSocketConnection.on("error", (error) => this.emit("error", error));
    this.webSocketConnection.on("text_message", (message) => this.emit("text_message", message));
    this.webSocketConnection.on("file_message", (message) => this.emit("file_message", message));

    this.webSocketConnection.on("event_table_values", (eventTable: LoxoneValueEvent[]) => {
      this.filterAndLogAndEmitEvents(eventTable);
    });
    this.webSocketConnection.on("event_table_text", (eventTable: LoxoneTextEvent[]) => {
      this.filterAndLogAndEmitEvents(eventTable);
    });

    this.wired = true;
  }

  private filterAndLogAndEmitEvents(eventTable: LoxoneEvent[]): void {
    let filteredEventTable = eventTable;
    // filter by watchlist
    if (this.uuidWatchlist.size > 0) {
      filteredEventTable = eventTable.filter((event) =>
        this.uuidWatchlist.has(event.uuid.stringValue),
      );
    }
    filteredEventTable.forEach((event) => {
      // enrich if we have the data
      if (this.isStructureFileParsed) {
        if (event instanceof LoxoneEnrichableEvent) {
          // oxlint-disable-next-line no-param-reassign
          event = this.enrichEvent(event);
        }
        if (this.options.maintainLatestEvents) {
          const state = this.states.get(event.uuid.stringValue);
          if (state) {
            state.latestEvent = event;
          }
        }
      }
      if (
        this.options.messageLogEnabled &&
        (this.options.logAllEvents || this.uuidWatchlist.size > 0)
      ) {
        this.log.debug(`Loxone event: ${event.toString()}`);
      }
      if (event instanceof LoxoneValueEvent) {
        this.emit("event_value", event);
      } else if (event instanceof LoxoneTextEvent) {
        this.emit("event_text", event);
      } else if (event instanceof LoxoneDayTimerEvent) {
        this.emit("event_daytimer", event);
      } else if (event instanceof LoxoneWeatherEvent) {
        this.emit("event_weather", event);
      }
    });
  }

  /**
   * Adds one or more UUIDs to the watch list. Value and text events will only be emitted for these UUIDs.
   * If the watchlist is empty, all events will be emitted.
   * @param {string | string[]} uuid The UUID or array of UUIDs to add
   */
  addUuidToWatchList(uuid: string | string[]): void {
    const ids = Array.isArray(uuid) ? uuid : [uuid];
    for (const id of ids) {
      if (this.isStructureFileParsed && !this.states.has(id)) {
        this.log.warn(`UUID ${id} is not present in the structure file`);
      }
      this.uuidWatchlist.add(id);
    }
  }

  /**
   * Removes one or more UUIDs from the watch list.
   * @param {string | string[]} uuid The UUID or array of UUIDs to remove
   */
  removeUuidFromWatchList(uuid: string | string[]): void {
    const ids = Array.isArray(uuid) ? uuid : [uuid];
    ids.forEach((id) => this.uuidWatchlist.delete(id));
  }

  private enrichEvent<T extends LoxoneEnrichableEvent>(event: T): T {
    if (!this.isStructureFileParsed) return event;

    const state = this.states.get(event.uuid.stringValue);
    if (!state) return event;

    event.state = state;

    event.isEnriched = true;

    return event;
  }

  private async checkVersion(): Promise<void> {
    const response = await fetch(new URL("jdev/cfg/apiKey", this.baseUrl));
    if (response.status === 503) {
      throw new Error("Miniserver is rebooting");
    }
    if (!response.ok) {
      this.log.error(`Failed to check version: ${response.status}`, response);
      throw new Error(`Failed to check version: ${response.status}`);
    }
    // oxlint-disable-next-line typescript/no-explicit-any
    const data: any = await response.json();

    if (data.LL?.Code !== "200") {
      this.log.error(`Invalid reponse code: ${data.LL?.Code}`, data.LL);
      throw new Error(`Invalid reponse code: ${data.LL?.Code}`);
    }

    const jsonString = data.LL.value.replace(/'/g, '"');
    const dataJson = JSON.parse(jsonString);
    const version = dataJson.version;
    const versionParts = version.split(".");
    if (versionParts[0] < 11 || (versionParts[0] === 11 && versionParts[1] < 2)) {
      this.log.error(`Unsupported Loxone firmware version, needs to be at least 11.2: ${version}`);
      exit(1);
    }

    if (dataJson.httpsStatus) {
      this.isGen2 = true;
    }
  }

  private ensureReadyState(errorReason: string): void {
    if (this._state !== LoxoneClientState.ready) {
      throw new Error(`Client is not in an expected state - ${errorReason}`);
    }
  }

  private setState(state: LoxoneClientState): void {
    if (this._state !== state) {
      this._state = state;
      this.log.info(`State changed to: ${YELLOW}${state}${nf}`);
      this.emit("stateChanged", state);
    }
  }

  // Typed emitting of events
  override on<K extends keyof LoxoneClientEvents>(event: K, listener: LoxoneClientEvents[K]): this {
    // oxlint-disable-next-line typescript/no-explicit-any
    return super.on(event, listener as (...args: any[]) => void);
  }

  override once<K extends keyof LoxoneClientEvents>(
    event: K,
    listener: LoxoneClientEvents[K],
  ): this {
    // oxlint-disable-next-line typescript/no-explicit-any
    return super.once(event, listener as (...args: any[]) => void);
  }

  override off<K extends keyof LoxoneClientEvents>(
    event: K,
    listener: LoxoneClientEvents[K],
  ): this {
    // oxlint-disable-next-line typescript/no-explicit-any
    return super.off(event, listener as (...args: any[]) => void);
  }

  override emit<K extends keyof LoxoneClientEvents>(
    event: K,
    ...args: Parameters<LoxoneClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

export default LoxoneClient;
