"use client";
import type { NearConnector } from "@hot-labs/near-connect";
let connector: NearConnector | undefined;
export async function testnetWallet() {
  if (!connector) {
    const { NearConnector } = await import("@hot-labs/near-connect");
    connector = new NearConnector({network:"testnet",features:{signMessage:true,testnet:true,signAndSendTransaction:true},autoConnect:false,providers:{testnet:["https://test.rpc.fastnear.com"]}});
  }
  return connector.connect();
}
export async function walletRequest(operation:string,body:unknown) {
  const response=await fetch(`/api/${operation}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error??"The request could not be completed.");
  return result;
}
