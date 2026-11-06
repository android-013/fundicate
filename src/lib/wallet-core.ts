import { createHash, createPublicKey, verify } from "node:crypto";
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function decodeBase58(value: string): Buffer {
  if (!value || value.length > 100) throw new Error("Invalid encoded key.");
  let n = 0n;
  for (const char of value) { const digit = alphabet.indexOf(char); if (digit < 0) throw new Error("Invalid encoded key."); n = n*58n+BigInt(digit); }
  const hex = n.toString(16).padStart(2,"0");
  const bytes = n === 0n ? Buffer.alloc(0) : Buffer.from(hex.length % 2 ? "0"+hex : hex,"hex");
  return Buffer.concat([Buffer.alloc(value.match(/^1*/)?.[0].length ?? 0),bytes]);
}
export function nep413Hash(message: string, nonce: Buffer, recipient: string, callbackUrl?: string) {
  if (nonce.length !== 32) throw new Error("A wallet nonce must contain 32 bytes.");
  const integer = (n: number) => { const b=Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const string = (v: string) => { const b=Buffer.from(v,"utf8"); return Buffer.concat([integer(b.length),b]); };
  return createHash("sha256").update(Buffer.concat([integer(2**31+413),string(message),nonce,string(recipient),Buffer.from([callbackUrl ? 1 : 0]),...(callbackUrl ? [string(callbackUrl)] : [])])).digest();
}
export function verifyWalletSignature(input:{message:string;nonce:string;recipient:string;callbackUrl?:string;publicKey:string;signature:string}) {
  try {
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.publicKey) || !/^[A-Za-z0-9+/]{86}==$/.test(input.signature)) return false;
    const raw=decodeBase58(input.publicKey.slice(8));
    if(raw.length !== 32) return false;
    const key=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),raw]),format:"der",type:"spki"});
    return verify(null,nep413Hash(input.message,Buffer.from(input.nonce,"base64"),input.recipient,input.callbackUrl),key,Buffer.from(input.signature,"base64"));
  } catch { return false; }
}
