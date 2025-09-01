import Auth from './Auth.js';
import { hash, hmacHash } from '../Utils/Hasher.js';
import WebSocketConnection from '../WebSocketConnection.js';
import TextMessage from '../WebSocketMessages/TextMessage.js';
import { AnsiLogger } from 'node-ansi-logger';

class TokenHandler {
    token: string | undefined;
    auth: Auth;
    username: string;
    connection: WebSocketConnection;
    validUntil: string | undefined;
    validUntilDateUTC: Date | undefined;
    password: string;
    // timer that will attempt to refresh the token before it expires
    private refreshTimer: NodeJS.Timeout | undefined;
    // buffer (ms) before actual expiry when we attempt to refresh
    private refreshBufferMs = 2 * 3600 * 1000; // 2 hours
    // retry/backoff settings when refresh fails
    private refreshRetryMs = 5 * 60 * 1000; // 5 minutes
    private refreshMaxRetries = 5;
    private refreshRetries = 0;
    log: AnsiLogger;

    constructor(auth: Auth, log: AnsiLogger, connection: WebSocketConnection, username: string, password: string) {
        this.log = log;
        this.auth = auth;
        this.connection = connection;
        this.username = username;
        this.password = password;
    }

    async refreshToken() {
        if (!this.token || !this.validUntilDateUTC) {
            throw new Error('No token to refresh');
        }

        const msUntilExpiry = this.validUntilDateUTC.getTime() - Date.now();

        if (msUntilExpiry < 0) {
            this.log.warn('Token cannot be refreshed any more as it expired. Trying to acquire a new one');
            this.acquireToken();
            return;
        }

        // 1. Acquire new “key”, “salt” & “hashAlg” at once using “jdev/sys/getkey2/{user}”
        await this.auth.getUserKey();

        if (!this.auth.userKey) throw new Error('User key is missing');

        // 2. hash token
        const tokenHash = hmacHash(this.token, this.auth.userKey);

        // 3. Request a JSON Web Token “jdev/sys/refreshjwt/{tokenHash}/{this.username}”
        const refreshTokenCommand = `jdev/sys/refreshjwt/${tokenHash}/${this.username}`;
        const refreshTokenResponse = await this.connection.sendEncryptedTextCommand(refreshTokenCommand);

        // 4. Store response
        this.token = refreshTokenResponse.value.token;
        this.processTokenResponse(refreshTokenResponse);
    }

    async acquireToken() {
        // 1. Acquire the “key”, “salt” & “hashAlg” at once using “jdev/sys/getkey2/{user}”
        await this.auth.getUserKey();
        if (!this.auth.userKey) throw new Error('User key is missing');

        // 2. Hash the password including the user specific salt
        const pwdHashPayload = `${this.password}:${this.auth.userSalt}`;
        const pwdHash = hash(pwdHashPayload, this.auth.userHashAlg).toUpperCase();

        // 3. Create the hmac hash that includes the user name
        const userHashPayload = `${this.username}:${pwdHash}`;
        const userHash = hmacHash(userHashPayload, this.auth.userKey);

        // 4. Request a JSON Web Token “jdev/sys/getjwt/{hash}/{user}/{permission}/{uuid}/{info}”
        const permission = 2;
        const uuid = '11fecda8-c89a-48fb-8209-45ed851e81c7';
        const info = `loxone-ts-api-${this.username}`;
        const jwtUrl = `jdev/sys/getjwt/${userHash}/${this.username}/${permission}/${uuid}/${info}`;
        const jwtResponse = await this.connection.sendEncryptedTextCommand(jwtUrl);

        // 5. Store the response, it contains info on the lifespan, the permissions granted with that token and the JSON Web Token itself.
        if (jwtResponse.code !== 200) {
            throw new Error(`Failed to acquire JWT: ${jwtResponse.code}`);
        }
        if (!jwtResponse.value) {
            throw new Error(`jwtResponse.value is undefined`);
        }

        this.log.info('Acquired token');

        this.token = jwtResponse.value.token;
        this.processTokenResponse(jwtResponse);
    }

    async checkToken(token?: string) {
        const tokenTocheck = token || this.token;
        if (!tokenTocheck) return;

        await this.auth.getUserKey();
        if (!this.auth.userKey) throw new Error('User key is missing');
        const tokenHash = hmacHash(tokenTocheck, this.auth.userKey);

        const checkTokenCommand = `jdev/sys/checktoken/${tokenHash}/${this.username}`;
        const checkTokenResponse = await this.connection.sendEncryptedTextCommand(checkTokenCommand);
        if (checkTokenResponse.code !== 200) {
            this.log.info(`Token is not valid: ${checkTokenResponse.code}`);
            return;
        }
        this.log.info(`Token is valid: ${checkTokenResponse.code}`);
    }

    async authenticateWithToken(token: string) {
        if (!token) return;

        await this.auth.getUserKey();
        if (!this.auth.userKey) throw new Error('User key is missing');
        const tokenHash = hmacHash(token, this.auth.userKey);

        const authWithTokenCommand = `authwithtoken/${tokenHash}/${this.username}`;
        const authWithTokenResponse = await this.connection.sendEncryptedTextCommand(authWithTokenCommand);
        if (authWithTokenResponse.code !== 200) {
            throw new Error(`Failed to authenticate with existing token: ${authWithTokenResponse.code}`);
        }
        this.log.info(`Authenticated with existing token`);

        this.token = token;
        this.processTokenResponse(authWithTokenResponse);
    }

    async killToken() {
        if (this.token) {
            await this.auth.getUserKey();
            if (!this.auth.userKey) throw new Error('User key is missing');

            const tokenHash = hmacHash(this.token, this.auth.userKey);
            const killTokenCommand = `jdev/sys/killtoken/${tokenHash}/${this.username}`;
            try {
                await this.connection.sendEncryptedTextCommand(killTokenCommand);
                // loxone will disconnect the websocket
            } catch {
                /* ignore any exceptions */
            }
            this.clearScheduledRefresh();
            this.log.info(`Token killed`);
        }
    }

    private processTokenResponse(tokenResponse: TextMessage) {
        this.validUntil = tokenResponse.value.validUntil;
        if (!this.validUntil) throw new Error('Token validUntil is missing');
        const seconds = parseInt(this.validUntil);
        const baseMs = Date.UTC(2009, 0, 1, 0, 0, 0);
        this.validUntilDateUTC = new Date(baseMs + seconds * 1000);

        this.log.info(`Token valid until: ${this.validUntilDateUTC.toLocaleString()}`);

        // Schedule automatic refresh
        this.refreshRetries = 0;
        this.scheduleRefresh();
    }

    // Clear any pending refresh timer
    clearScheduledRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    // Schedule a refresh attempt some time before validUntilDate.
    // If the computed time is already past, attempt immediate refresh.
    private scheduleRefresh() {
        this.clearScheduledRefresh();

        if (!this.token || !this.validUntilDateUTC) throw new Error('No token to schedule refresh for');

        const msUntilExpiry = this.validUntilDateUTC.getTime() - Date.now();
        const msUntilRefresh = msUntilExpiry - this.refreshBufferMs;

        const scheduleMs = msUntilRefresh > 0 ? msUntilRefresh : 0;

        // cap schedule to a reasonable maximum (1 week) to avoid overflow
        const maxMs = 7 * 24 * 60 * 60 * 1000;
        const finalMs = Math.min(scheduleMs, maxMs);

        const refreshDate = new Date(Date.now() + finalMs);

        this.log.info(`Scheduling token refresh at ${refreshDate.toLocaleString()}`);

        this.refreshTimer = setTimeout(async () => {
            try {
                this.log.info(`Reached scheduled token refresh time`);
                if (msUntilExpiry < 0) {
                    this.log.info('Token already expired, acquiring a new one');
                    await this.acquireToken();
                } else {
                    this.log.info('Attempting refresh of existing token');
                    await this.refreshToken();
                }
            } catch (err) {
                // on failure, retry with backoff until max retries
                this.refreshRetries = (this.refreshRetries || 0) + 1;
                this.log.error(`Token refresh failed (attempt ${this.refreshRetries}):`, err);
                if (this.refreshRetries <= this.refreshMaxRetries) {
                    this.refreshTimer = setTimeout(() => this.scheduleRefresh(), this.refreshRetryMs * this.refreshRetries);
                } else {
                    this.log.error('Max token refresh retries reached, giving up');
                }
            }
        }, finalMs);
    }
}

export default TokenHandler;
