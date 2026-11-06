const DB_NAME="evm-market-trait-index-v2";
const DB_VERSION=1;
const NFT_STORE="nfts";
const SCAN_STORE="scans";
export const COLLECTION_SUPPLY=10000;
export const TRAIT_SCAN_PAGE_SIZE=50;

function openDatabase(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error("Ce navigateur ne permet pas de conserver l’index complet des traits."));return}
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(NFT_STORE)){
        const store=db.createObjectStore(NFT_STORE,{keyPath:"key"});
        store.createIndex("contract","contract",{unique:false});
      }
      if(!db.objectStoreNames.contains(SCAN_STORE))db.createObjectStore(SCAN_STORE,{keyPath:"contract"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Impossible d’ouvrir le stockage local des traits."));
  });
}
function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("Erreur du stockage local des traits."))})}
function transactionDone(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error("Échec de l’enregistrement de l’index des traits."));transaction.onabort=()=>reject(transaction.error||new Error("Enregistrement de l’index des traits annulé."))})}
function slimNft(nft,contract){
  const id=String(nft?.identifier??nft?.token_id??nft?.tokenId??"");
  if(!/^(0|[1-9][0-9]{0,77})$/.test(id))return null;
  const source=Array.isArray(nft?.metadata?.attributes)&&nft.metadata.attributes.length?nft.metadata.attributes:Array.isArray(nft?.traits)?nft.traits:[];
  const attributes=source.filter(t=>t&&t.value!==undefined&&t.value!==null).map(t=>({trait_type:String(t.trait_type||t.traitType||t.key||t.type||t.name||"Trait"),value:String(t.value)}));
  const image=String(nft?.display_image_url||nft?.image_url||nft?.metadata?.image||"");
  return {key:contract.toLowerCase()+":"+id,contract:contract.toLowerCase(),identifier:id,token_id:id,name:String(nft?.name||nft?.metadata?.name||""),image_url:image,display_image_url:image,metadata:{attributes}};
}
export async function readTraitIndex(contract){
  const db=await openDatabase();
  try{
    const tx=db.transaction([NFT_STORE,SCAN_STORE],"readonly");
    const done=transactionDone(tx);
    const recordsRequest=tx.objectStore(NFT_STORE).index("contract").getAll(contract.toLowerCase());
    const scanRequest=tx.objectStore(SCAN_STORE).get(contract.toLowerCase());
    const [records,scan]=await Promise.all([requestResult(recordsRequest),requestResult(scanRequest)]);
    await done;
    return {nfts:records.map(({key,contract:storedContract,...nft})=>nft),scan:scan||null};
  }finally{db.close()}
}
async function savePage(contract,nfts,scan){
  const db=await openDatabase();
  try{
    const tx=db.transaction([NFT_STORE,SCAN_STORE],"readwrite");
    const nftStore=tx.objectStore(NFT_STORE);
    for(const nft of nfts)nftStore.put(nft);
    tx.objectStore(SCAN_STORE).put(scan);
    await transactionDone(tx);
  }finally{db.close()}
}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

export async function scanTraitIndex({contract,onProgress=()=>{},signal}={}){
  const normalized=String(contract||"").toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(normalized))throw new Error("Adresse de collection invalide pour le scan des traits.");
  let {nfts,scan}=await readTraitIndex(normalized);
  const byId=new Map(nfts.map(n=>[String(n.identifier),n]));
  if(scan?.exhausted)return {nfts:[...byId.values()],scan,complete:scan.coverageComplete};
  let cursor=scan?.next||null,attempts=0;
  while(true){
    if(signal?.aborted)throw new DOMException("Scan annulé.","AbortError");
    const query=new URLSearchParams({contract:normalized,scanTraits:"1",limit:String(TRAIT_SCAN_PAGE_SIZE)});
    if(cursor)query.set("next",cursor);
    let response;
    try{response=await fetch("/api/nfts?"+query.toString(),{cache:"no-store",headers:{accept:"application/json","cache-control":"no-cache"},signal})}
    catch(error){if(signal?.aborted)throw error;if(++attempts>4)throw error;await delay(Math.min(8000,1000*2**(attempts-1)));continue}
    if(response.status===429){
      if(++attempts>6)throw new Error("OpenSea limite temporairement le scan. Réessayez dans quelques minutes.");
      const seconds=Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(seconds)&&seconds>0?Math.min(30000,seconds*1000):Math.min(15000,1000*2**attempts));
      continue;
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Le fournisseur n’a pas pu poursuivre le scan des traits.");
    attempts=0;
    const page=[];
    for(const value of Array.isArray(data.nfts)?data.nfts:[]){const nft=slimNft(value,normalized);if(nft){byId.set(nft.identifier,nft);page.push(nft)}}
    cursor=typeof data.next==="string"&&data.next?data.next:null;
    const exhausted=!cursor;
    scan={contract:normalized,next:cursor,scanned:byId.size,expected:COLLECTION_SUPPLY,exhausted,coverageComplete:exhausted&&byId.size===COLLECTION_SUPPLY,updatedAt:Date.now(),source:String(data.source||"opensea-trait-index")};
    await savePage(normalized,page,scan);
    onProgress({scanned:byId.size,expected:COLLECTION_SUPPLY,exhausted,complete:scan.coverageComplete});
    if(exhausted)return {nfts:[...byId.values()],scan,complete:scan.coverageComplete};
    await delay(250);
  }
}
