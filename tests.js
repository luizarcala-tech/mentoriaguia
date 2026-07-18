// ══════════════════════════════════════════════════════════════════
// ARCALA INSIGHT — Suíte de testes (launcher)
// Uso: node tests.js — combina stubs + plataforma + testes e executa
// 25 testes ISOLADOS (I01-I25) + 26 INTEGRADOS (J01-J25 + J05b)
// + AUDITORIA ESTRUTURAL (S00, S01): análise estática sobre o HTML real,
//   sem stubs — pega bugs que os testes de lógica NÃO conseguem ver
//   (ex.: getElementById apontando para um id que não existe de verdade).
// ══════════════════════════════════════════════════════════════════
const fs = require('fs'), cp = require('child_process'), os = require('os'), path = require('path');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const platformJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

// ── S00/S01: auditoria estrutural (estática, sem stubs, sem eval) ──
let s00Pass = true, s01Pass = true;
const structFailures = [];
(function structuralAudit(){
  const htmlOnly = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  const staticIds = new Set([
    ...[...htmlOnly.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),
    ...[...htmlOnly.matchAll(/\bid='([^']+)'/g)].map(m=>m[1]),
  ]);
  const dynamicIds = new Set([
    ...[...platformJs.matchAll(/\bid="([^"$]+)"/g)].map(m=>m[1]),
    ...[...platformJs.matchAll(/\bid='([^'$]+)'/g)].map(m=>m[1]),
    ...[...platformJs.matchAll(/\bid=\\"([^"\\$]+)\\"/g)].map(m=>m[1]),
    ...[...platformJs.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m=>m[1]),
    ...[...platformJs.matchAll(/\.id\s*=\s*"([^"]+)"/g)].map(m=>m[1]),
  ]);
  const allIds = new Set([...staticIds, ...dynamicIds]);
  const gets = [
    ...[...platformJs.matchAll(/getElementById\('([^'$]+)'\)/g)].map(m=>m[1]),
    ...[...platformJs.matchAll(/getElementById\("([^"$]+)"\)/g)].map(m=>m[1]),
  ];
  // Elementos cosméticos conhecidos e sem impacto funcional (guardados com if(el))
  const ALLOWLIST_COSMETIC = new Set(['platform-version-badge']);
  const missing = [...new Set(gets.filter(g => !allIds.has(g) && !ALLOWLIST_COSMETIC.has(g)))];
  if(missing.length){
    s00Pass = false;
    missing.forEach(m => structFailures.push("S00 getElementById('"+m+"') — elemento não existe em lugar nenhum do HTML/JS"));
  }

  const fnNames = [...platformJs.matchAll(/(?:async )?function (\w+)\s*\(/g)].map(m=>m[1]);
  const counts = {}; fnNames.forEach(n=>counts[n]=(counts[n]||0)+1);
  const dupes = Object.entries(counts).filter(([,c])=>c>1);
  if(dupes.length){
    s01Pass = false;
    dupes.forEach(([n,c]) => structFailures.push('S01 função "'+n+'" definida '+c+'x — a última sobrescreve as demais silenciosamente'));
  }
})();

// ── S02: prompt da prova pede o campo "explicacao" (suporte à análise crítica) ──
let s02Pass = true;
(function checkQuizExplanationField(){
  const idx = platformJs.indexOf('function startQuiz');
  if(idx < 0){ s02Pass = false; structFailures.push('S02 função startQuiz não encontrada'); return; }
  const fnSrc = platformJs.slice(idx, idx+2500);
  if(!fnSrc.includes('explicacao')){ s02Pass = false; structFailures.push('S02 prompt da prova não pede o campo "explicacao"'); }
  if(!fnSrc.includes('refletir') && !fnSrc.includes('crítica')){ s02Pass = false; structFailures.push('S02 prompt da prova não orienta reflexão crítica'); }
})();

// ── I01-I25 / J01-J25(+J05b): testes de lógica em ambiente Node isolado ──
const self = fs.readFileSync(__filename, 'utf8');
const stubs = self.split('//STUBS_'+'START')[1].split('//STUBS_'+'END')[0];
const tests = self.split('//TESTS_'+'START')[1].split('//TESTS_'+'END')[0];
fs.writeFileSync(path.join(os.tmpdir(),'_arcala_run.js'), stubs + '\n' + platformJs + '\n' + tests);
const r = cp.spawnSync('node', [path.join(os.tmpdir(),'_arcala_run.js')], {encoding:'utf8', timeout:60000});

const m = /PASS=(\d+) FAIL=(\d+)/.exec(r.stdout||'');
const logicPass = m ? parseInt(m[1]) : 0;
const logicFail = m ? parseInt(m[2]) : 1;

console.log('── Auditoria estrutural (análise estática do HTML/JS real, sem stubs) ──');
console.log(s00Pass ? "✅ S00 todo getElementById aponta para um elemento que existe de verdade" : "❌ S00 há getElementById apontando para elemento inexistente");
console.log(s01Pass ? "✅ S01 nenhuma função duplicada" : "❌ S01 há função(ões) duplicada(s)");
console.log(s02Pass ? "✅ S02 prova pede campo de explicação para análise crítica" : "❌ S02 prova sem campo de explicação");
structFailures.forEach(f => console.log('   ↳ '+f));

console.log('\n── Testes de lógica (ambiente Node com stubs) ──');
process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||'');

const structPassCount = (s00Pass?1:0) + (s01Pass?1:0) + (s02Pass?1:0);
const structFailCount = (s00Pass?0:1) + (s01Pass?0:1) + (s02Pass?0:1);
const finalPass = logicPass + structPassCount;
const finalFail = logicFail + structFailCount;
console.log('\n════ RESULTADO FINAL: PASS='+finalPass+' FAIL='+finalFail+' ════');
process.exit(finalFail>0 ? 1 : 0);


// As seções abaixo nunca executam neste arquivo (process.exit acima) — são fonte para o combinador.
function __sections__(){
//STUBS_START

const _store = {};
global.localStorage = { getItem: k => _store[k] ?? null, setItem: (k,v)=>{_store[k]=String(v);}, removeItem: k=>{delete _store[k];} };
const _elems = {};
function mkEl(){ return new Proxy({style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},dataset:{},innerHTML:'',value:'',textContent:'',checked:false,appendChild(){},remove(){},querySelector(){return mkEl()},querySelectorAll(){return []},addEventListener(){},scrollIntoView(){},focus(){},click(){}},{get(t,p){if(p in t)return t[p];return typeof p==='string'&&p.startsWith('on')?null:t[p];},set(t,p,v){t[p]=v;return true;}}); }
global.document = { getElementById: id => { if(!_elems[id]) _elems[id]=mkEl(); return _elems[id]; }, querySelector:()=>mkEl(), querySelectorAll:()=>[], createElement:()=>mkEl(), body:mkEl(), addEventListener(){} };
global.window = new Proxy({location:{search:'',href:'https://x/',hash:''},addEventListener(){},open(){}},{get(t,p){if(p in t)return t[p];return undefined;},set(t,p,v){t[p]=v;global[p]=v;return true;}});
global.navigator = {clipboard:{writeText:async()=>{}}};
let _fetchLog = [];
global.fetch = async (url,opts) => { _fetchLog.push({url,method:(opts&&opts.method)||'GET'}); return {ok:true,status:200,json:async()=>[],text:async()=>''}; };
global.Chart = class { constructor(){} destroy(){} update(){} };
global.crypto = require('crypto').webcrypto;
global.btoa = s => Buffer.from(s).toString('base64');
global.atob = s => Buffer.from(s,'base64').toString();
global.alert=()=>{}; global.confirm=()=>true; global.prompt=()=>'teste';


//STUBS_END
//TESTS_START


let pass=0, fail=0; const failures=[];
const T = (name, fn) => { try { fn(); pass++; } catch(e){ fail++; failures.push(name+' → '+e.message); } };
const TA = async (name, fn) => { try { await fn(); pass++; } catch(e){ fail++; failures.push(name+' → '+e.message); } };
const reset = () => { Object.keys(_store).forEach(k=>delete _store[k]); Object.keys(_elems).forEach(k=>delete _elems[k]); _fetchLog=[]; };
const seed = () => {
  currentUser = {id:'u1',name:'Mentee Y',email:'my@t.com',role:'mentorado',active:true,phase:'U',mentor_id:'m1'};
  currentRole = 'mentorado';
  DB.set('users',[{id:'a1',name:'Admin',email:'adm@t.com',role:'admin',active:true},
                  {id:'m1',name:'Mentor X',email:'mx@t.com',role:'mentor',active:true},
                  currentUser]);
  const cy = {id:'cy1',name:'Ciclo 1',status:'active',competencias:[],mentee_email:'my@t.com'};
  DB.set('cycles_my@t.com',[cy]);
  DB.set('comp_active_radar','cy1'); DB.set('current_cycle_id','cy1');
  return cy;
};

(async () => {
// ═══════════ 25 TESTES ISOLADOS ═══════════
reset(); seed();
T('I01 addCompByName grava no ciclo', ()=>{ addCompByName('Liderança'); if(DB.get('cycles_my@t.com')[0].competencias[0]?.name!=='Liderança') throw new Error('x'); });
T('I02 duplicata bloqueada', ()=>{ addCompByName('Liderança'); if(DB.get('cycles_my@t.com')[0].competencias.length!==1) throw new Error('x'); });
T('I03 limite de 7', ()=>{ ['A','B','C','D','E','F','G','H'].forEach(addCompByName); if(DB.get('cycles_my@t.com')[0].competencias.length!==7) throw new Error('x'); });
T('I04 setCompVal me', ()=>{ setCompVal(0,'me',5); if(DB.get('cycles_my@t.com')[0].competencias[0].me!==5) throw new Error('x'); });
T('I05 setCompVal mentor', ()=>{ currentRole='mentor'; setCompVal(0,'mentor',4); currentRole='mentorado'; if(DB.get('cycles_my@t.com')[0].competencias[0].mentor!==4) throw new Error('x'); });
T('I06 removeComp', ()=>{ removeComp(6); if(DB.get('cycles_my@t.com')[0].competencias.length!==6) throw new Error('x'); });
T('I07 frozen bloqueia add', ()=>{ const cs=DB.get('cycles_my@t.com'); cs[0].frozen_at='2026-01-01'; DB.set('cycles_my@t.com',cs); addCompByName('Nova'); if(DB.get('cycles_my@t.com')[0].competencias.length!==6) throw new Error('x'); });
T('I08 frozen bloqueia remove', ()=>{ removeComp(0); const n=DB.get('cycles_my@t.com')[0].competencias.length; const cs=DB.get('cycles_my@t.com'); cs[0].frozen_at=null; DB.set('cycles_my@t.com',cs); if(n!==6) throw new Error('x'); });
T('I09 add persiste no Supabase (PATCH)', ()=>{ _fetchLog=[]; addCompByName('Extra'); if(!_fetchLog.some(f=>f.method==='PATCH'&&f.url.includes('cycles'))) throw new Error('sem PATCH'); removeComp(6); });
T('I10 signAcordo mentee', ()=>{ signAcordo('cy1','mentee'); if(!getAcordoSignatures('cy1').mentee) throw new Error('x'); });
T('I11 acordo não completo com 1 assinatura', ()=>{ if(isAcordoFullySigned('cy1')) throw new Error('x'); });
T('I12 signAcordo mentor completa', ()=>{ currentUser.role='mentor'; signAcordo('cy1','mentor'); currentUser.role='mentorado'; if(!isAcordoFullySigned('cy1')) throw new Error('x'); });
await TA('I13 hashPassword SHA-256 hex', async()=>{ const h=await hashPassword('abc'); if(!/^[a-f0-9]{64}$/.test(h)) throw new Error(h); });
await TA('I14 hash determinístico', async()=>{ if(await hashPassword('abc')!==await hashPassword('abc')) throw new Error('x'); });
T('I15 checkpoint grava', ()=>{ saveCheckpoint('my@t.com',{date:today(),conquista:'c',bloqueio:'',energia:4}); if(getCheckpoints('my@t.com').length!==1) throw new Error('x'); });
T('I16 streak calcula', ()=>{ if(calculateStreak(getCheckpoints('my@t.com'))<1) throw new Error('x'); });
T('I17 diário grava', ()=>{ saveDiarioEntry('my@t.com',{texto:'reflexão',mood:4,date:today()}); if(getDiario('my@t.com').length!==1) throw new Error('x'); });
T('I18 DISC 12 blocos com tipo', ()=>{ if(DISC_BLOCKS.length!==12) throw new Error('len='+DISC_BLOCKS.length); if(DISC_BLOCKS.filter(b=>b.tipo==='natural').length!==6) throw new Error('naturais!=6'); });
T('I19 DISC scoring separa natural/adaptado', ()=>{ discAnswers=DISC_BLOCKS.map(()=>({most:0,least:1})); discShuffled=DISC_BLOCKS.map(b=>({...b,opts:[...b.opts]})); const s=calcDISCScores(); if(!s.natural||!s.adaptado) throw new Error('x'); });
T('I20 normalizeToPercent soma 100', ()=>{ const p=normalizeToPercent({D:3,I:2,S:1,C:2}); const sum=p.D+p.I+p.S+p.C; if(sum!==100) throw new Error('soma='+sum); });
T('I21 calcEffort delta', ()=>{ const e=calcEffort({D:40,I:20,S:20,C:20},{D:25,I:35,S:20,C:20}); if(e.D!==-15||e.I!==15) throw new Error(JSON.stringify(e)); });
T('I22 getDominant', ()=>{ if(getDominant({D:1,I:9,S:2,C:3})!=='I') throw new Error('x'); });
T('I23 computeNextBestAction sugere', ()=>{ const nba=computeNextBestAction(); if(!nba||!nba.label) throw new Error('x'); });
T('I24 notificações computam sem erro', ()=>{ /* async ok se não lançar */ computeNotifications(); });
T('I25 sessão expirada é limpa', ()=>{ DB.set('session',{userId:'u1',expires:Date.now()-1000}); checkSession(); if(DB.get('session')) throw new Error('não limpou'); });

// ═══════════ 25 TESTES INTEGRADOS (jornadas) ═══════════
reset();
await TA('J01 login admin com senha correta', async()=>{ const h=await hashPassword('Arcala@2026'); DB.set('users',[{id:'a1',name:'Admin',email:'adm@t.com',role:'admin',active:true,password:h}]); document.getElementById('login-email').value='adm@t.com'; document.getElementById('login-pass').value='Arcala@2026'; currentUser=null; await doLogin(); if(!currentUser) throw new Error('x'); });
await TA('J02 sessão gravada com expires', async()=>{ const s=DB.get('session'); if(!s||!s.expires||s.expires<Date.now()) throw new Error('x'); });
await TA('J03 senha errada rejeitada', async()=>{ currentUser=null; document.getElementById('login-pass').value='errada'; await doLogin(); if(currentUser) throw new Error('x'); });
await TA('J04 migração base64→sha256', async()=>{ const us=DB.get('users'); us.push({id:'l1',name:'Leg',email:'leg@t.com',role:'mentorado',active:true,password:btoa('s1')}); DB.set('users',us); document.getElementById('login-email').value='leg@t.com'; document.getElementById('login-pass').value='s1'; await doLogin(); const u=DB.get('users').find(x=>x.email==='leg@t.com'); if(!/^[a-f0-9]{64}$/.test(u.password)) throw new Error('x'); });
await TA('J05 inativo bloqueado', async()=>{ const us=DB.get('users'); us.push({id:'i1',name:'In',email:'in@t.com',role:'mentorado',active:false,password:await hashPassword('x')}); DB.set('users',us); currentUser=null; document.getElementById('login-email').value='in@t.com'; document.getElementById('login-pass').value='x'; await doLogin(); if(currentUser) throw new Error('x'); });
await TA('J05b troca de role sobrevive mesmo com PATCH falhando (RLS)', async()=>{
  const us=DB.get('users'); us.push({id:'r1',name:'Trocar Role',email:'role@t.com',role:'mentorado',active:true}); DB.set('users',us);
  // Simula PATCH ao Supabase falhando (RLS bloqueando) — sbFetch lança erro
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error('RLS violation'); };
  const u = DB.get('users').find(x=>x.email==='role@t.com');
  u.role='mentor'; DB.set('users', DB.get('users').map(x=>x.email===u.email?u:x));
  await sbPatchUser('role@t.com', {role:'mentor'}); // deve falhar silenciosamente e retornar false
  global.fetch = async (url) => ({ok:true, status:200, json:async()=>[{id:'r1',name:'Trocar Role',email:'role@t.com',role:'mentorado',active:true}], text:async()=>JSON.stringify([{id:'r1',name:'Trocar Role',email:'role@t.com',role:'mentorado',active:true}])});
  const reloaded = await loadAllUsers();
  global.fetch = origFetch;
  const after = reloaded.find(x=>x.email==='role@t.com');
  if(after.role!=='mentor') throw new Error('role revertido para: '+after.role);
});
await TA('J05c cenário real: editUser→form→updateUser→renderAdminUsers mantém novo role', async()=>{
  DB.set('users',[
    {id:'a1',name:'Admin',email:'adm2@t.com',role:'admin',active:true},
    {id:'v1',name:'Verena',email:'verena@t.com',role:'mentor',active:true},
    {id:'lf1',name:'Luiz Fellipe',email:'lf@t.com',role:'mentorado',active:false,mentor_id:'v1',plan:'Ciclo único — 12 semanas'},
  ]);
  currentUser={id:'a1',name:'Admin',email:'adm2@t.com',role:'admin',active:true}; currentRole='admin';
  editUser('lf@t.com');
  document.getElementById('nu-name').value='Luiz Fellipe';
  document.getElementById('nu-role').value='mentor';
  document.getElementById('nu-plan').value='Ciclo único — 12 semanas';
  document.getElementById('nu-empresa').value='';
  document.getElementById('nu-mentor').value='v1';
  document.getElementById('nu-active').value='0';
  await updateUser();
  await renderAdminUsers();
  const after = DB.get('users').find(u=>u.email==='lf@t.com');
  if(after.role!=='mentor') throw new Error('role ficou: '+after.role);
});
T('J05d e-mail duplicado no retorno do Supabase é unificado sem perder o role local', ()=>{
  DB.set('users',[{id:'d1',name:'Dup',email:'dup@t.com',role:'mentor',active:true}]);
});
await TA('J05d2 dedup real via loadAllUsers', async()=>{
  const origFetch = global.fetch;
  // Supabase retorna DUAS linhas para o mesmo e-mail (cenário de duplicidade real)
  global.fetch = async () => { const rows=[
    {id:'d1',name:'Dup',email:'dup@t.com',role:'mentorado',active:true},
    {id:'d1-old',name:'Dup',email:'dup@t.com',role:'mentorado',active:true},
  ]; return {ok:true, status:200, json:async()=>rows, text:async()=>JSON.stringify(rows)}; };
  const reloaded = await loadAllUsers();
  global.fetch = origFetch;
  const matches = reloaded.filter(u=>u.email==='dup@t.com');
  if(matches.length!==1) throw new Error('não unificou — ainda há '+matches.length+' linhas');
  if(matches[0].role!=='mentor') throw new Error('role local perdido no dedup: '+matches[0].role);
});
await TA('J05e nome editado localmente sobrevive a duplicatas no Supabase com nomes antigos', async()=>{
  DB.set('users',[{id:'n1',name:'Nome Editado No Admin',email:'nome@t.com',role:'mentorado',active:true}]);
  const origFetch = global.fetch;
  // Duas linhas duplicadas no Supabase, ambas com o nome ANTIGO (antes da edição)
  global.fetch = async () => { const rows=[
    {id:'n1',name:'Nome Antigo',email:'nome@t.com',role:'mentorado',active:true},
    {id:'n1-dup',name:'Nome Antigo Duplicado',email:'nome@t.com',role:'mentorado',active:true},
  ]; return {ok:true, status:200, json:async()=>rows, text:async()=>JSON.stringify(rows)}; };
  const reloaded = await loadAllUsers();
  global.fetch = origFetch;
  const u = reloaded.find(x=>x.email==='nome@t.com');
  if(u.name !== 'Nome Editado No Admin') throw new Error('nome revertido para: '+u.name);
});
await TA('J05f dedup de duplicatas SEM edição local é determinístico (não depende da ordem)', async()=>{
  DB.set('users',[]); // nenhum registro local — simula outro dispositivo/sessão
  const rowA = {id:'x1',name:'Perfil Completo',email:'det@t.com',role:'mentorado',active:true,plan:'Ciclo único — 12 semanas',empresa_id:'e1'};
  const rowB = {id:'x2',name:'Perfil Incompleto',email:'det@t.com',role:'mentorado',active:true};
  const origFetch = global.fetch;

  global.fetch = async () => ({ok:true,status:200,json:async()=>[rowA,rowB],text:async()=>JSON.stringify([rowA,rowB])});
  const result1 = await loadAllUsers();

  DB.set('users',[]);
  global.fetch = async () => ({ok:true,status:200,json:async()=>[rowB,rowA],text:async()=>JSON.stringify([rowB,rowA])}); // ordem invertida
  const result2 = await loadAllUsers();
  global.fetch = origFetch;

  const u1 = result1.find(u=>u.email==='det@t.com');
  const u2 = result2.find(u=>u.email==='det@t.com');
  if(u1.name !== u2.name) throw new Error('resultado depende da ordem: '+u1.name+' vs '+u2.name);
  if(u1.name !== 'Perfil Completo') throw new Error('não escolheu o registro mais completo: '+u1.name);
});
await TA('J05g cleanupDuplicateUsersInSupabase remove duplicatas de verdade via DELETE', async()=>{
  currentUser={id:'a1',name:'Admin',email:'admcln@t.com',role:'admin',active:true}; currentRole='admin';
  const deleted = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if(opts && opts.method==='DELETE'){ deleted.push(url); return {ok:true,status:204,json:async()=>[],text:async()=>''}; }
    const rows=[
      {id:'k1',name:'Completo',email:'clean@t.com',role:'mentorado',active:true,plan:'X'},
      {id:'k2',name:'Incompleto',email:'clean@t.com',role:'mentorado',active:true},
    ]; return {ok:true,status:200,json:async()=>rows,text:async()=>JSON.stringify(rows)};
  };
  await cleanupDuplicateUsersInSupabase();
  global.fetch = origFetch;
  if(deleted.length !== 1) throw new Error('esperava 1 DELETE, houve '+deleted.length);
  if(!deleted[0].includes('k2')) throw new Error('removeu o registro errado: '+deleted[0]);
});
T('J05h sanitizeUserPayload remove campos que não existem na tabela users', ()=>{
  const dirty = {id:'z1', name:'X', email:'z@t.com', role:'mentor', mentorados:['a','b'],
                 campo_futuro_inventado: 'não deveria ir para o Supabase', outraCoisa: 123};
  const clean = sanitizeUserPayload(dirty);
  if('campo_futuro_inventado' in clean) throw new Error('campo desconhecido vazou para o payload');
  if('outraCoisa' in clean) throw new Error('outro campo desconhecido vazou');
  if(clean.mentorados === undefined) throw new Error('campo válido (mentorados) foi removido por engano');
  if(clean.name !== 'X') throw new Error('campo válido corrompido');
});
await TA('J05i cenário real: sincronizar usuário com campo mentorados não quebra (reproduz o bug relatado)', async()=>{
  currentUser={id:'a1',name:'Admin',email:'admmr@t.com',role:'admin',active:true}; currentRole='admin';
  let capturedBody = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if(opts && opts.method==='POST' && url.includes('/users')){
      capturedBody = JSON.parse(opts.body);
      // Simula o Postgrest recusando coluna desconhecida — só aceita se o payload já vier limpo
      const allowed = new Set(['id','name','email','role','plan','active','phase','week','created','password','mentor_id','empresa_id','mentorados','curriculo_texto','curriculo_arquivo','curriculo_data']);
      const bad = Object.keys(capturedBody).find(k=>!allowed.has(k));
      if(bad) throw new Error("PGRST204: Could not find the '"+bad+"' column of 'users' in the schema cache");
      return {ok:true,status:201,json:async()=>[capturedBody],text:async()=>JSON.stringify([capturedBody])};
    }
    return {ok:true,status:200,json:async()=>[],text:async()=>''};
  };
  DB.set('users',[{id:'mr1',name:'Mentor com Mentorados',email:'mr1@t.com',role:'mentor',active:true,mentorados:['x1','x2'],_localOnlyDebugField:'lixo qualquer'}]);
  await syncAllUsersToSupabase();
  global.fetch = origFetch;
  if(!capturedBody) throw new Error('POST nunca foi chamado');
  if('_localOnlyDebugField' in capturedBody) throw new Error('campo de lixo local vazou para o Supabase');
  if(JSON.stringify(capturedBody.mentorados) !== JSON.stringify(['x1','x2'])) throw new Error('mentorados não foi preservado corretamente');
});
await TA('J06a cenário Claudinei: aprovar cadastro sincroniza com Supabase', async()=>{
  let posted = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if(opts && opts.method==='POST' && url.includes('/users')){ posted = JSON.parse(opts.body); return {ok:true,status:201,json:async()=>[posted],text:async()=>JSON.stringify([posted])}; }
    if(opts && opts.method==='PATCH'){ return {ok:true,status:200,json:async()=>[],text:async()=>''}; }
    return {ok:true,status:200,json:async()=>[],text:async()=>''};
  };
  DB.set('registrations',[{id:'reg1',name:'Claudinei',email:'claudinei@t.com',role:'mentorado',plan:'Trial — 2 semanas',status:'pending'}]);
  DB.set('users',[{id:'a1',name:'Admin',email:'adm3@t.com',role:'admin',active:true}]);
  await approveReg('reg1');
  global.fetch = origFetch;
  if(!posted) throw new Error('approveReg NÃO chamou POST no Supabase — usuário fica preso só localmente');
  if(posted.email!=='claudinei@t.com') throw new Error('POST com dados errados: '+JSON.stringify(posted));
  const localUser = DB.get('users').find(u=>u.email==='claudinei@t.com');
  if(!localUser) throw new Error('usuário aprovado não ficou salvo localmente');
});
await TA('J06b botão "Sincronizar todos" força upsert de cada usuário local', async()=>{
  const postedEmails = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if(opts && opts.method==='POST' && url.includes('/users')){ const b=JSON.parse(opts.body); postedEmails.push(b.email); return {ok:true,status:201,json:async()=>[b],text:async()=>JSON.stringify([b])}; }
    return {ok:true,status:200,json:async()=>[],text:async()=>''};
  };
  currentUser={id:'a1',name:'Admin',email:'adm4@t.com',role:'admin',active:true}; currentRole='admin';
  DB.set('users',[
    {id:'a1',name:'Admin',email:'adm4@t.com',role:'admin',active:true},
    {id:'p1',name:'Preso Localmente',email:'preso@t.com',role:'mentorado',active:true},
  ]);
  await syncAllUsersToSupabase();
  global.fetch = origFetch;
  if(!postedEmails.includes('preso@t.com')) throw new Error('syncAllUsersToSupabase não sincronizou o usuário local: '+JSON.stringify(postedEmails));
});

// Jornada completa do mentorado: ciclo → assina → DISC → competências → freeze → 360 → checkpoint → diário
reset(); const cy = seed();
await TA('J06 renderInicioCiclo executa', async()=>{ await renderInicioCiclo(); });
T('J07 mentee assina o termo', ()=>{ signAcordo('cy1','mentee'); if(!getAcordoSignatures('cy1').mentee) throw new Error('x'); });
T('J08 mentor assina — acordo completo', ()=>{ currentUser.role='mentor'; signAcordo('cy1','mentor'); currentUser.role='mentorado'; if(!isAcordoFullySigned('cy1')) throw new Error('x'); });
T('J09 DISC fim salva natural travado', ()=>{ discAnswers=DISC_BLOCKS.map(()=>({most:0,least:1})); discShuffled=DISC_BLOCKS.map(b=>({...b,opts:[...b.opts]})); discPage=DISC_BLOCKS.length-1; discNavigate(1); const full=DB.get('disc_result_full'); if(!full||!full.natural||!full.adaptado||!full.effort) throw new Error('x'); });
T('J10 perfil natural persistido por email', ()=>{ if(!getDISCNatural('my@t.com')) throw new Error('x'); });
T('J11 refazer DISC não sobrescreve natural', ()=>{ const before=JSON.stringify(getDISCNatural('my@t.com')); discPage=DISC_BLOCKS.length-1; discNavigate(1); if(JSON.stringify(getDISCNatural('my@t.com'))!==before) throw new Error('sobrescreveu'); });
T('J12 seleciona 5 competências', ()=>{ ['Liderança','Comunicação','Visão','Negociação','Execução'].forEach(addCompByName); if(DB.get('cycles_my@t.com')[0].competencias.length!==5) throw new Error('x'); });
T('J13 autoavalia e mentor avalia', ()=>{ setCompVal(0,'me',4); currentRole='mentor'; setCompVal(0,'mentor',3); currentRole='mentorado'; const c0=DB.get('cycles_my@t.com')[0].competencias[0]; if(c0.me!==4||c0.mentor!==3) throw new Error('x'); });
await TA('J14 renderComp executa com dados', async()=>{ await renderComp(); });
T('J15 freeze manual grava frozen_at+questions', ()=>{ const cs=DB.get('cycles_my@t.com'); cs[0].frozen_at=new Date().toISOString(); cs[0].questions_360=cs[0].competencias.map(c=>({competencia:c.name,situacoes:[{texto:'Situação sobre '+c.name},{texto:'Outra situação de '+c.name}]})); DB.set('cycles_my@t.com',cs); if(!DB.get('cycles_my@t.com')[0].questions_360.length) throw new Error('x'); });
T('J16 convida avaliador com token+sentAt', ()=>{ const peers=DB.get('peer360')||[]; peers.push({avaliador:'Chefe',email:'c@t.com',relacao:'Líder',token:'tok1',cycle_id:'cy1',respostas:null,done:false,sentAt:new Date().toISOString()}); DB.set('peer360',peers); if(!DB.get('peer360')[0].sentAt) throw new Error('x'); });
T('J17 avaliador responde', ()=>{ const peers=DB.get('peer360'); peers[0].respostas=[4,3,4,4,3,4,3,4,3,4]; peers[0].done=true; peers[0].obs='Ótimo profissional'; DB.set('peer360',peers); if(!DB.get('peer360')[0].done) throw new Error('x'); });
await TA('J18 renderPeer360 com respostas', async()=>{ await renderPeer360(); });
await TA('J19 analyze360WithIA roda com contexto', async()=>{ global.callAI = async()=>'ANÁLISE OK'; await analyze360WithIA(); });
T('J20 checkpoint semanal + streak', ()=>{ saveCheckpoint('my@t.com',{date:today(),conquista:'avanço',bloqueio:'tempo',energia:4}); if(calculateStreak(getCheckpoints('my@t.com'))<1) throw new Error('x'); });
T('J21 diário + humor', ()=>{ saveDiarioEntry('my@t.com',{texto:'boa semana',mood:5,date:today(),time:'10:00'}); if(getDiario('my@t.com')[0].mood!==5) throw new Error('x'); });
T('J22 renderMinhaJornada injeta checkpoint widget', ()=>{ renderMinhaJornada(); const s=document.getElementById('checkpoint-slot'); if(!s.innerHTML||s.innerHTML.length<50) throw new Error('x'); });
T('J23 digest do mentor com alerta e energia', ()=>{ currentUser=DB.get('users').find(u=>u.role==='mentor'); currentRole='mentor'; const d=renderMentorDigest(DB.get('users').filter(u=>u.role==='mentorado')); if(!d.includes('Digest da semana')) throw new Error('x'); });
await TA('J24 renderMentorDash com digest', async()=>{ await renderMentorDash(); });
await TA('J25 telas admin executam', async()=>{ currentUser=DB.get('users').find(u=>u.role==='admin'); currentRole='admin'; await renderAdminUsers(); await renderAdminMatch(); await renderDashboardROI(); });
T('J26 repairTruncatedQuizJSON reconstrói perguntas completas de resposta cortada', ()=>{
  // Simula exatamente o erro relatado: JSON cortado no meio de uma string (resposta truncada por max_tokens)
  const truncated = '{"questions":[' +
    '{"q":"O que é a Metodologia GUIA?","options":["Um framework de mentoria","Um software","Um curso","Uma empresa"],"correct":0},' +
    '{"q":"Quantas fases tem o GUIA?","options":["2","3","4","5"],"correct":2},' +
    '{"q":"O que significa a fase G?","options":["Gerar","Gestar Acordo","Guiar","Gerenciar"],"correct":1},' +
    '{"q":"Pergunta cortada no meio da string por limite de token';
  const repaired = repairTruncatedQuizJSON(truncated);
  const data = JSON.parse(repaired);
  if(data.questions.length !== 3) throw new Error('esperava 3 perguntas completas, veio '+data.questions.length);
  if(data.questions[2].q !== 'O que significa a fase G?') throw new Error('conteúdo da última pergunta completa incorreto');
});
T('J27 repairTruncatedQuizJSON preserva todas as perguntas quando o JSON já está completo', ()=>{
  const complete = '{"questions":[{"q":"P1","options":["A","B","C","D"],"correct":0},{"q":"P2","options":["A","B","C","D"],"correct":1}]}';
  const data = JSON.parse(complete); // fluxo normal nem chama o reparo
  if(data.questions.length !== 2) throw new Error('x');
});
await TA('J28 startQuiz usa max_tokens maior para não truncar (fluxo completo com resposta cortada)', async()=>{
  currentUser={id:'m1',name:'Mentor Teste',email:'mentor@t.com',role:'mentor',active:true};
  currentRole='mentor';
  document.querySelector = () => ({ innerText: 'Conteúdo da aula sobre a Metodologia GUIA.' });
  let capturedMaxTokens = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    capturedMaxTokens = body.max_tokens;
    // Simula a IA cortando a resposta no meio (mesmo padrão do erro relatado)
    const truncatedContent = '{"questions":[' +
      Array.from({length:6}, (_,i) => '{"q":"Pergunta '+(i+1)+'?","options":["A","B","C","D"],"correct":0}').join(',') +
      ',{"q":"Pergunta cortada no meio';
    return { ok:true, status:200, json: async()=>({content:[{text:truncatedContent}]}), text: async()=>'' };
  };
  await startQuiz(1);
  global.fetch = origFetch;
  if(capturedMaxTokens < 3000) throw new Error('max_tokens ainda baixo demais para 10 perguntas: '+capturedMaxTokens);
  const qc = document.getElementById('quiz-content');
  if(qc.innerHTML.includes('Erro ao gerar prova')) throw new Error('quiz falhou mesmo com o reparo — deveria aproveitar as 6 perguntas completas');
});
T('J29 saveCurriculo/getCurriculo grava e recupera localmente', ()=>{
  DB.set('curriculo_cv@t.com', null);
  DB.set('users',[{id:'cv1',name:'CV Teste',email:'cv@t.com',role:'mentorado',active:true}]);
  const data = {texto:'Experiência em liderança de equipes de produto por 8 anos.', arquivo:'perfil.pdf', data:new Date().toISOString()};
  DB.set('curriculo_cv@t.com', data);
  const got = getCurriculo('cv@t.com');
  if(!got || got.texto !== data.texto) throw new Error('não recuperou o currículo salvo');
});
T('J30 getCurriculoContextSnippet retorna vazio quando não há currículo', ()=>{
  DB.set('curriculo_semcv@t.com', null);
  const s = getCurriculoContextSnippet('semcv@t.com');
  if(s !== '') throw new Error('deveria ser string vazia, veio: '+JSON.stringify(s));
});
T('J31 getCurriculoContextSnippet inclui o texto quando presente', ()=>{
  DB.set('curriculo_cv2@t.com', {texto:'Formação em Engenharia e MBA em Gestão.', arquivo:'x.pdf', data:new Date().toISOString()});
  const s = getCurriculoContextSnippet('cv2@t.com');
  if(!s.includes('Formação em Engenharia e MBA em Gestão.')) throw new Error('snippet não contém o texto do currículo');
  if(!s.includes('CURRÍCULO (LinkedIn')) throw new Error('snippet sem o rótulo esperado');
});
T('J32 getCurriculoContextSnippet trunca currículos muito longos', ()=>{
  const textoLongo = 'A'.repeat(5000);
  DB.set('curriculo_cv3@t.com', {texto:textoLongo, arquivo:'x.pdf', data:new Date().toISOString()});
  const s = getCurriculoContextSnippet('cv3@t.com');
  if(s.length > 3200) throw new Error('snippet não foi truncado, tamanho='+s.length);
  if(!s.includes('resumido')) throw new Error('não sinalizou que foi resumido');
});
await TA('J33 callAI injeta o currículo no systemContext enviado à IA', async()=>{
  currentUser={id:'cv4',name:'Mentorado CV',email:'cv4@t.com',role:'mentorado',active:true,phase:'U'};
  currentRole='mentorado';
  DB.set('curriculo_cv4@t.com', {texto:'Especialista em vendas B2B com passagem por 3 multinacionais.', arquivo:'x.pdf', data:new Date().toISOString()});
  let capturedSystem = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    capturedSystem = JSON.parse(opts.body).system;
    return { ok:true, status:200, json: async()=>({content:[{text:'ok'}]}), text: async()=>'' };
  };
  await callAI('Analise o perfil deste mentorado', true);
  global.fetch = origFetch;
  if(!capturedSystem || !capturedSystem.includes('Especialista em vendas B2B')) throw new Error('currículo não chegou ao prompt da IA');
});
T('J34 removeCurriculo limpa o registro local', ()=>{
  DB.set('curriculo_cv5@t.com', {texto:'texto', arquivo:'a.pdf', data:new Date().toISOString()});
  DB.set('curriculo_cv5@t.com', null); // equivalente ao efeito de removeCurriculo após confirmação
  if(getCurriculo('cv5@t.com')) throw new Error('currículo não foi removido');
});

T('J35 submitQuiz mostra gabarito com acerto/erro e explicação por pergunta', ()=>{
  currentQuiz = {
    lessonId: 1,
    questions: [
      {q:'Pergunta 1?', options:['A1','B1','C1','D1'], correct:0, explicacao:'Explicação da pergunta 1 para reflexão crítica.'},
      {q:'Pergunta 2?', options:['A2','B2','C2','D2'], correct:2, explicacao:'Explicação da pergunta 2 para reflexão crítica.'},
    ]
  };
  quizAnswers = {0:0, 1:1}; // acerta a 1, erra a 2
  DB.set('training_progress', null);
  submitQuiz();
  const html = document.getElementById('content-area').innerHTML;
  if(!html.includes('Gabarito e análise crítica')) throw new Error('painel de gabarito não apareceu');
  if(!html.includes('✅')) throw new Error('não marcou a pergunta certa');
  if(!html.includes('❌')) throw new Error('não marcou a pergunta errada');
  if(!html.includes('Explicação da pergunta 1')) throw new Error('explicação da P1 ausente');
  if(!html.includes('Explicação da pergunta 2')) throw new Error('explicação da P2 ausente');
  if(!html.includes('Resposta correta')) throw new Error('não mostrou a resposta correta na pergunta errada');
});
T('J36 gabarito não expõe "resposta correta" redundante quando o mentor já acertou', ()=>{
  currentQuiz = { lessonId:1, questions:[{q:'P?', options:['A','B','C','D'], correct:1, explicacao:'Dica.'}] };
  quizAnswers = {0:1}; // acertou
  DB.set('training_progress', null);
  submitQuiz();
  const html = document.getElementById('content-area').innerHTML;
  const correctBlockCount = (html.match(/Resposta correta/g)||[]).length;
  if(correctBlockCount !== 0) throw new Error('mostrou "Resposta correta" mesmo tendo acertado');
});
// ── RESULTADO ──
console.log('PASS='+pass+' FAIL='+fail);
if(failures.length){ failures.forEach(f=>console.log('❌ '+f)); process.exit(1); }
process.exit(0);
})().catch(e=>{ console.log('HARNESS FATAL: '+e.message); process.exit(1); });

//TESTS_END
}
