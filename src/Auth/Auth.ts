import TokenHandler from './TokenHandler.js';
import WebSocketConnection from '../WebSocketConnection.js';
import { constants, publicEncrypt } from 'node:crypto';
import CommandEncryption from './CommandEncryption.js';
import { AnsiLogger } from 'node-ansi-logger';

class Auth {
    private password: string;
    private username: string;
    private host: string;
    private connection: WebSocketConnection;
    private publicKey: any;
    private sessionKey: string | undefined;
    tokenHandler: TokenHandler;
    userKey: Buffer<ArrayBuffer> | undefined;
    userHashAlg: any;
    userSalt: any;
    commandEncryption: CommandEncryption;
    log: AnsiLogger;

    constructor(log: AnsiLogger, connection: WebSocketConnection, host: string, username: string, password: string) {
        this.log = log;
        this.connection = connection;
        this.host = host;
        this.username = username;
        this.password = password;

        this.tokenHandler = new TokenHandler(this, log, this.connection, this.username, this.password);
        this.commandEncryption = new CommandEncryption(this);
    }

    async authenticate(existingToken?: string) {
        // 1. get public key
        await this.getPublicKey();

        // 2. verify public key
        // TODO

        // 3. generate AES key - done in CommandEncryption constructor

        // 4. generate IV - done in CommandEncryption constructor

        // 5. encrypt key+iv with public key
        const payload = `${this.commandEncryption.key.toString('hex')}:${this.commandEncryption.iv.toString('hex')}`;
        const encrypted = publicEncrypt(this.publicKey!, Buffer.from(payload));
        this.sessionKey = encrypted.toString('base64');

        // 6. exchange session key
        const keyExchangeCommand = `jdev/sys/keyexchange/${this.sessionKey}`;
        const response = await this.connection.sendUnencryptedTextCommand(keyExchangeCommand);
        if (response.code !== 200) {
            throw new Error(`Failed to exchange session key: ${response.code}`);
        }

        // 7. generate random salt - done in constructor

        // 8. auth with existing token or acquire token
        if (existingToken) {
            await this.tokenHandler.authenticateWithToken(existingToken);
        } else {
            await this.tokenHandler.acquireToken();
        }

        this.log.info('Authentication complete');
    }

    private async getPublicKey() {
        const response = await fetch('http://' + this.host + '/jdev/sys/getcertificate');
        this.parsePublicKey(await response.text());
    }

    private parsePublicKey(message: string) {
        const certBlocks = message.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
        if (certBlocks === null || certBlocks?.length === 0) {
            throw new Error('No public key found in getPublicKey response');
        }
        const leafCert = certBlocks[certBlocks.length - 1];
        this.publicKey = {
            'key': leafCert,
            'padding': constants.RSA_PKCS1_PADDING,
        };
    }

    async getUserKey() {
        const getKeyCommand = `jdev/sys/getkey2/${this.username}`;
        const getKeyResponse = await this.connection.sendEncryptedTextCommand(getKeyCommand);
        if (getKeyResponse.code !== 200) {
            throw new Error(`Failed to getkey2: ${getKeyResponse.code}`);
        }
        if (!getKeyResponse.value) {
            throw new Error(`getkeyresponse.value is undefined`);
        }

        // server returns the key as a hex-encoded string; convert to raw bytes
        const serverKeyHex = getKeyResponse.value.key;
        this.userKey = Buffer.from(serverKeyHex, 'hex');
        this.userSalt = getKeyResponse.value.salt;
        this.userHashAlg = getKeyResponse.value.hashAlg;
    }
}

export default Auth;
