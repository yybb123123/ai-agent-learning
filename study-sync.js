/* StudySync v1 — private cross-device study progress for one owner.
 * Server: existing Cloudflare Worker /api/sync/{main|exam|courses} + D1.
 * No credentials in GitHub. Token stays in sessionStorage (this tab only).
 * Three-way field merge preserves independent edits; conflicting changes never
 * silently overwrite each other. Keep JSON backups for disaster recovery.
 */
(function () {
"use strict";
const DEFAULT_WORKER = "https://asos-study-deepseek.coolloveice.workers.dev";
const MASTER_KEY = "asos_study_workspace_2026_v1";
const SESSION_TOKEN_KEY = "study_sync_tab_token_v1";
const SESSION_WORKER_KEY = "study_sync_worker_v1";
const PREFIX = "study_sync_base_v1_";
const MISSING = Symbol("missing");
const MAX_RETRIES = 3;
const DELAY = 4500;
let cfg=null, token="", worker="", busy=false, timer=null, enabled=false, paused=false, conflicts=null;
let lastChecked=0, lastRemote=null;
const $=id=>document.getElementById(id);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function same(a,b){
 if(a===MISSING||b===MISSING)return a===b;
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return JSON.stringify(a)===JSON.stringify(b);
 if(plain(a)&&plain(b)){
  const x=Object.keys(a),y=Object.keys(b);return x.length===y.length&&x.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same(a[k],b[k]));
 }
 return false;
}
function merge3(base,local,remote,path,issues,preference){
 if(same(local,remote))return local;
 if(same(local,base))return remote;
 if(same(remote,base))return local;
 if(plain(local)&&plain(remote)&&(plain(base)||base===MISSING)){
  const out={},keys=new Set([...Object.keys(base===MISSING?{}:base),...Object.keys(local),...Object.keys(remote)]);
  for(const k of keys){
   if(["__proto__","prototype","constructor"].includes(k))continue;
   const pick=obj=>obj!==MISSING&&Object.prototype.hasOwnProperty.call(obj,k)?obj[k]:MISSING;
   const v=merge3(pick(base),pick(local),pick(remote),path?path+"."+k:k,issues,preference);
   if(v!==MISSING)out[k]=v;
  }
  return out;
 }
 issues.push(path||"(root)");
 return preference==="cloud"?remote:local;
}
function clone(o){return JSON.parse(JSON.stringify(o));}
function readBase(){
 try{const x=JSON.parse(localStorage.getItem(PREFIX+cfg.scope)||"null");
  if(x&&Number.isSafeInteger(x.revision)&&x.revision>=0&&plain(x.data))return x;
 }catch(_){}
 return {revision:0,data:{}};
}
function saveBase(revision,data){
 try{localStorage.setItem(PREFIX+cfg.scope,JSON.stringify({revision,data}));return true}
 catch(_){status("本机空间不足，无法保存同步版本；请先导出当前笔记备份。","error");return false}
}
function backupLocal(data){
 try{localStorage.setItem("study_sync_premerge_v1_"+cfg.scope,JSON.stringify({when:new Date().toISOString(),data}));return true}
 catch(_){status("本机空间不足，无法生成安全备份；已停止合并。请导出 JSON 备份。","error");return false}
}
function status(message,kind="neutral"){
 const out=$("studySyncStatus");if(!out)return;out.textContent=message;
 out.style.color=kind==="error"?"#a12b24":kind==="ok"?"#196d50":"#556273";
}
function text(v){return String(v??"");}
function validateWorker(raw){
 try{const u=new URL(text(raw).trim());if(u.protocol!=="https:"||!u.hostname.endsWith(".workers.dev")||u.pathname!=="/"||u.search||u.hash||u.username||u.password)return "";
 return u.origin}catch(_){return ""}
}
function masterWorker(){
 try{const x=JSON.parse(localStorage.getItem(MASTER_KEY)||"{}");return validateWorker(x.settings?.workerUrl||"")}catch(_){return ""}
}
function download(label,data){
 const blob=new Blob([JSON.stringify({format:"study-sync-safety-copy",scope:cfg.scope,exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="StudySync_"+cfg.scope+"_"+label+"_"+new Date().toISOString().slice(0,10)+".json";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function api(method,path,payload){
 const response=await fetch(worker+"/api/"+path,{
  method,
  headers:{"X-Study-Token":token,...(payload?{"Content-Type":"application/json"}:{})},
  body:payload?JSON.stringify(payload):undefined,
  cache:"no-store"
 });
 let result={};try{result=await response.json()}catch(_){}
 if(!response.ok){
  const error=new Error(result.error||"HTTP "+response.status);error.code=response.status;throw error;
 }
 return result;
}
function renderConflict(){
 const panel=$("studySyncConflict");if(!panel)return;
 panel.hidden=!conflicts;
 if(conflicts){
  $("studySyncConflictText").textContent="检测到两台设备修改同一内容："+conflicts.paths.slice(0,3).join("、")+
   (conflicts.paths.length>3?" 等 "+conflicts.paths.length+" 处":"")+
   "。已暂停自动同步，尚未覆盖本机或云端记录。请先下载两份备份，再选择解决方式。";
 }
}
function stopConflict(paths, local,remote,rev){
 conflicts={paths,local:clone(local),remote:clone(remote),revision:rev};
 try{localStorage.setItem("study_sync_conflicts_v1_"+cfg.scope,JSON.stringify({at:new Date().toISOString(),...conflicts}))}catch(_){}
 paused=true;renderConflict();status("发现编辑冲突，已暂停自动同步；两端数据仍保留。","error");
}
async function resolveConflict(preference){
 if(!conflicts||busy)return;
 const snapshot=conflicts;
 download("pre_resolution_local",snapshot.local);
 download("pre_resolution_cloud",snapshot.remote);
 const warning=preference==="local"?"本机":"云端";
 if(!confirm("已提供本机和云端两份 JSON 备份下载。将以【"+warning+"】版本解决冲突字段，同时保留未冲突的修改。确定继续？"))return;
 busy=true;status("正在安全解决冲突…");
 try{
  const latest=await api("GET","sync/"+cfg.scope);
  const here=clone(cfg.get());
  const prior=readBase().data;
  const errors=[];
  const target=merge3(prior,here,latest.data||{},"",errors,preference);
  // The original pages continue to hold a local copy, and both complete
  // conflict snapshots are explicitly downloadable before resolution.
  let revision=latest.revision;
  if(!same(target,latest.data||{})){
   const saved=await api("PUT","sync/"+cfg.scope,{baseRevision:latest.revision,data:target});
   revision=saved.revision;
  }
  if(!saveBase(revision,target))return;
  if(!same(here,target)){
   if(!backupLocal(here))return;
   cfg.apply(clone(target));
  }
  conflicts=null;paused=false;renderConflict();
  lastChecked=Date.now();
  status("已合并未冲突的字段；冲突按"+warning+"版本处理。","ok");
 }catch(err){status("冲突处理失败："+err.message+"；请保留两份备份。","error");paused=true}
 finally{busy=false}
}
async function sync(manual=false){
 if(!enabled||busy||paused||!cfg)return;
 if(!manual&&isEditing()){schedule(5000);return}
 busy=true;status("正在读取云端学习记录…");
 try{
  for(let attempt=0;attempt<MAX_RETRIES;attempt++){
   const server=await api("GET","sync/"+cfg.scope);
   if(server.data!==null&&!plain(server.data))throw new Error("云端数据格式异常，已停止同步。");
   lastRemote=server.data||{};
   const local=clone(cfg.get());
   if(!plain(local))throw new Error("本地记录格式异常。");
   const prior=readBase();
   // First connection on a new browser with no study content: download the
   // cloud version rather than treating default selected-day fields as edits.
   if(prior.revision===0 && server.data && typeof cfg.hasWork==="function" && !cfg.hasWork(local)){
    if(!same(local,lastRemote)&&!backupLocal(local))return;
    if(!saveBase(server.revision,lastRemote))return;
    if(!same(local,lastRemote))cfg.apply(clone(lastRemote));
    lastChecked=Date.now();status("已从云端恢复学习进度。","ok");return;
   }
   // If the device previously synced a different cloud revision, merge the
   // local edits against the last acknowledged base.
   const issues=[];
   const proposed=merge3(prior.data,local,lastRemote,"",issues);
   if(issues.length){
    stopConflict(issues,local,lastRemote,server.revision);return
   }
   if(same(proposed,lastRemote)){
    const live=clone(cfg.get());
    const during=[];
    const applied=merge3(local,live,proposed,"",during);
    if(during.length){stopConflict(during,live,lastRemote,server.revision);return}
    if(!same(live,applied)&&!backupLocal(live))return;
    if(!same(live,applied))cfg.apply(clone(applied));
    if(!saveBase(server.revision,proposed))return;
    lastChecked=Date.now();
    status("已同步 · 云端版本 "+server.revision+" · "+new Date().toLocaleTimeString("zh-CN"),"ok");
    if(!same(proposed,applied))schedule(500);return;
   }
   try{
    status("正在安全上传学习记录…");
    const reply=await api("PUT","sync/"+cfg.scope,{baseRevision:server.revision,data:proposed});
    const live=clone(cfg.get()),during=[];
    const applied=merge3(local,live,proposed,"",during);
    if(during.length){stopConflict(during,live,proposed,reply.revision);return}
    if(!same(live,applied)&&!backupLocal(live))return;
    if(!same(live,applied))cfg.apply(clone(applied));
    if(!saveBase(reply.revision,proposed))return;
    lastChecked=Date.now();
    status("已同步 · 云端版本 "+reply.revision+" · "+new Date().toLocaleTimeString("zh-CN"),"ok");
    if(!same(proposed,applied))schedule(500);return;
   }catch(err){if(err.code===409&&attempt<MAX_RETRIES-1)continue;throw err}
  }
 }catch(err){
  status("同步失败："+err.message+"（本机学习记录未删除）","error");
 }finally{busy=false}
}
function isEditing(){
 const target=document.activeElement;
 return target&&!target.closest("#studySyncPanel")&&
  ["INPUT","TEXTAREA"].includes(target.tagName);
}
function schedule(ms=DELAY){
 if(!enabled||paused||!cfg)return;
 clearTimeout(timer);timer=setTimeout(()=>sync(false),ms);
}
function start(config){
 if(cfg)throw Error("StudySync was already initialized");
 if(!["main","exam","courses"].includes(config.scope)||typeof config.get!=="function"||typeof config.apply!=="function")throw Error("Invalid StudySync config");
 cfg=config;
 worker=validateWorker(sessionStorage.getItem(SESSION_WORKER_KEY)||"")||masterWorker()||DEFAULT_WORKER;
 token=sessionStorage.getItem(SESSION_TOKEN_KEY)||"";
 const css=document.createElement("style");css.textContent=
 "#studySyncPanel{max-width:1160px;margin:12px auto;padding:13px;border:1px solid #bdd2e0;border-radius:9px;background:#f2f8fc;color:#1b3347;font:13px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}"+
 "#studySyncPanel input{width:100%;min-width:0;padding:8px;border:1px solid #b5c7d5;border-radius:6px;background:white}"+
 "#studySyncPanel .syncFields{display:grid;grid-template-columns:minmax(160px,1fr) minmax(160px,1fr);gap:10px;margin:10px 0}"+
 "#studySyncPanel button{padding:7px 10px;border:1px solid #b6cfdf;background:white;border-radius:6px;margin:3px}"+
 "#studySyncPanel .syncWarn{background:#fff5ea;border:1px solid #e4bfb2;border-radius:6px;padding:9px;margin-top:8px}"+
 "#studySyncPanel [hidden]{display:none!important}"+
 "@media(max-width:650px){#studySyncPanel{margin:8px;padding:10px}#studySyncPanel .syncFields{grid-template-columns:1fr}}";
 document.head.appendChild(css);
 const panel=document.createElement("section");panel.id="studySyncPanel";
 panel.innerHTML='<strong>☁️ 手机与电脑学习进度同步</strong> · <span id="studySyncStatus">仅本地保存；连接后可云端同步</span>'+
  '<div class="syncFields"><label>Cloudflare Worker 地址<input id="studySyncUrl" inputmode="url" placeholder="https://...workers.dev" autocomplete="off"></label>'+
  '<label>个人访问口令（STUDY_ACCESS_TOKEN，不是 DeepSeek API Key）<input type="password" id="studySyncToken" autocomplete="off"></label></div>'+
  '<div><button type="button" id="studySyncConnect">连接并同步</button><button type="button" id="studySyncNow">立即同步</button>'+
  '<button type="button" id="studySyncCloudBackup">导出云端 JSON</button><button type="button" id="studySyncPause">停止本标签页同步</button></div>'+
  '<div style="font-size:12px;color:#526879;margin-top:5px">连接后在本标签页有效，课程编辑后自动同步；使用多个设备时分别开启。学习记录保存在你的 Cloudflare D1 中，不公开到 GitHub。发生冲突不会自动覆盖；请定期另存原有 JSON 备份。<a href="./cloudflare/STUDY-SYNC.md" target="_blank" rel="noopener noreferrer">Cloudflare D1 配置说明 ↗</a></div>'+
  '<div id="studySyncConflict" class="syncWarn" hidden><strong>有修改冲突</strong><p id="studySyncConflictText"></p>'+
  '<button id="studySyncLocalBackup">下载本机副本</button><button id="studySyncRemoteBackup">下载云端副本</button>'+
  '<button id="studySyncKeepLocal">以本机版本为准</button><button id="studySyncKeepCloud">以云端版本为准</button></div>';
 const h=document.querySelector("header");if(h)h.insertAdjacentElement("afterend",panel);else document.body.insertBefore(panel,document.body.firstChild);
 $("studySyncUrl").value=worker;$("studySyncToken").value=token;
 // Share this tab's study access token with the existing DeepSeek assistant.
 const deepSeekToken=$("studyToken");
 if(deepSeekToken&&token&&!deepSeekToken.value)deepSeekToken.value=token;
 $("studySyncConnect").addEventListener("click",async()=>{
  const url=validateWorker($("studySyncUrl").value),entered=$("studySyncToken").value.trim();
  if(!url){status("Worker 网址格式不正确，请填 https://...workers.dev 根网址。","error");return}
  if(entered.length<32){status("个人访问口令至少应有32个字符；不要填 DeepSeek API Key。","error");return}
  worker=url;token=entered;
  sessionStorage.setItem(SESSION_WORKER_KEY,worker);
  sessionStorage.setItem(SESSION_TOKEN_KEY,token);
  if(deepSeekToken)deepSeekToken.value=token;
  if(typeof cfg.onWorker==="function")cfg.onWorker(worker);
  enabled=true;paused=false;conflicts=null;renderConflict();await sync(true);
 });
 $("studySyncNow").addEventListener("click",()=>sync(true));
 $("studySyncCloudBackup").addEventListener("click",async()=>{
  if(!enabled){status("先点击连接并同步。","error");return}
  try{const r=await api("GET","sync/"+cfg.scope);download("cloud",r.data||{});status("已生成云端 JSON 备份。","ok")}catch(err){status("云端备份失败："+err.message,"error")}
 });
 $("studySyncPause").addEventListener("click",()=>{
  enabled=false;paused=false;conflicts=null;clearTimeout(timer);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);token="";$("studySyncToken").value="";
  if(deepSeekToken)deepSeekToken.value="";
  renderConflict();status("同步已停止；当前设备仍可继续离线记笔记。");
 });
 $("studySyncLocalBackup").addEventListener("click",()=>{if(conflicts)download("local",conflicts.local)});
 $("studySyncRemoteBackup").addEventListener("click",()=>{if(conflicts)download("cloud",conflicts.remote)});
 $("studySyncKeepLocal").addEventListener("click",()=>resolveConflict("local"));
 $("studySyncKeepCloud").addEventListener("click",()=>resolveConflict("cloud"));
 if(token.length>=32){enabled=true;sync(true)}
 window.addEventListener("focus",()=>{if(enabled&&Date.now()-lastChecked>15000)sync(false)});
 document.addEventListener("visibilitychange",()=>{if(enabled&&!document.hidden&&Date.now()-lastChecked>15000)sync(false)});
 document.addEventListener("focusout",e=>{if(enabled&&!e.target.closest("#studySyncPanel"))schedule(700)});
 setInterval(()=>{if(enabled&&!document.hidden&&Date.now()-lastChecked>60000)sync(false)},60000);
}
window.StudySync={start,changed:()=>schedule(),syncNow:()=>sync(true)};
})();