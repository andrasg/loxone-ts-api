import { createCipheriv, randomBytes } from 'node:crypto';
import Auth from './Auth.js';

class CommandEncryption {
    auth: Auth;
    private current_salt: string;
    private saltBytes = 16;
    private saltUsageCount: number;
    private maxSaltTime: number;
    private nextSaltTime: number;
    private maxSaltUsage: number;
    key: Buffer;
    iv: Buffer;

    constructor(auth: Auth) {
        this.auth = auth;
        this.saltBytes = 16;
        this.current_salt = this.generate_salt();
        this.saltUsageCount = 0;
        this.maxSaltUsage = 20;
        this.maxSaltTime = 30 * 1000;
        this.nextSaltTime = new Date().getTime() + this.maxSaltTime;
        this.iv = randomBytes(16);
        this.key = randomBytes(32);
    }

    getEncryptedCommand(command: string): string {
        let salt_part = `salt/${this.current_salt}`;
        if (this.isNewSaltNeeded()) {
            const oldSalt = this.current_salt;
            this.current_salt = this.generate_salt();
            salt_part = `nextSalt/${oldSalt}/${this.current_salt}`;
        }
        const enc_part = this.cipher(`${salt_part}/${command}`, 'base64');

        return `jdev/sys/enc/${encodeURIComponent(enc_part)}`;
    }

    private isNewSaltNeeded(): boolean {
        if (this.saltUsageCount <= 0) {
            this.nextSaltTime = new Date().getTime() + this.maxSaltTime;
        }
        this.saltUsageCount++;
        if (this.saltUsageCount >= this.maxSaltUsage || this.nextSaltTime < new Date().getTime()) {
            this.saltUsageCount = 0;
            return true;
        }
        return false;
    }

    // private decipher(enc_data: string): string {
    //     var decipher = crypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
    //     decipher.setAutoPadding(false);
    //     var data = decipher.update(enc_data, 'base64', 'utf-8');
    //     data += decipher.final('utf-8');
    //     return data.replace(/\x00+[\s\S]*$/, "");
    // };

    private cipher(data: string, out_enc: 'base64'): string {
        const cipher = createCipheriv('aes-256-cbc', this.key, this.iv);
        let enc_data = cipher.update(data + '\0', 'utf-8', out_enc);
        enc_data += cipher.final(out_enc);
        return enc_data;
    }

    private generate_salt() {
        return encodeURIComponent(randomBytes(this.saltBytes).toString('hex'));
    }
}

export default CommandEncryption;
