import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SIGNERS_DIR = path.join(os.homedir(), ".warden");

export interface TrustedSigner {
  identity: string;
  publicKey: string;
}

export class TrustedSigners {
  static getSignersPath(): string {
    return path.join(SIGNERS_DIR, "allowed_signers");
  }

  static load(): TrustedSigner[] {
    const signersPath = TrustedSigners.getSignersPath();
    if (!fs.existsSync(signersPath)) return [];
    const stat = fs.lstatSync(signersPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to read symlink: ${signersPath}`);
    }
    return fs
      .readFileSync(signersPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const identity = parts[0];
        const keyType = parts[1];
        const key = parts.slice(2).join(" ");
        return { identity, publicKey: `${keyType} ${key}` };
      });
  }

  static add(identity: string, publicKey: string): void {
    if (publicKey.includes("\n") || publicKey.includes("\r")) {
      throw new Error("Public key must not contain newlines");
    }
    fs.mkdirSync(SIGNERS_DIR, { recursive: true });
    const signersPath = TrustedSigners.getSignersPath();
    if (fs.existsSync(signersPath)) {
      const stat = fs.lstatSync(signersPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to write to symlink: ${signersPath}`);
      }
    }
    const line = `${identity} ${publicKey}\n`;
    fs.appendFileSync(signersPath, line);
  }

  static remove(identity: string): boolean {
    const signers = TrustedSigners.load();
    const filtered = signers.filter((s) => s.identity !== identity);
    if (filtered.length === signers.length) return false;
    const signersPath = TrustedSigners.getSignersPath();
    const content = filtered.map((s) => `${s.identity} ${s.publicKey}`).join("\n");
    fs.writeFileSync(signersPath, content.length > 0 ? content + "\n" : "");
    return true;
  }

  static has(identity: string): boolean {
    return TrustedSigners.load().some((s) => s.identity === identity);
  }
}
