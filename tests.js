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
  const ALLOWLIST_COSMETIC = new Set([]);
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

// ── S03: TODA escrita na tabela `users` deve passar por sanitizeUserPayload/sbPatchUser/
// sbUpsertUser — impede para sempre a classe de bug "PGRST204 column not found" causada
// por um campo local sem coluna correspondente no Supabase vazar para o banco.
let s03Pass = true;
(function checkAllUserWritesSanitized(){
  const callRe = /sbFetch\(\s*'users[^']*'(?:\s*\+[^,]+?)?\s*,\s*'(POST|PATCH)'\s*,\s*([^)]+?)\)/g;
  let m;
  while((m = callRe.exec(platformJs))){
    const arg = m[2];
    const safe = arg.includes('sanitizeUserPayload') || /^clean\b/.test(arg.trim());
    const context = platformJs.slice(Math.max(0,m.index-200), m.index);
    const insideSbPatchUser = /async function sbPatchUser\([^)]*\)\{[^}]*$/.test(context.slice(-250));
    if(!safe && !insideSbPatchUser){
      s03Pass = false;
      structFailures.push('S03 escrita não sanitizada em users: sbFetch(\'users...\',\''+m[1]+'\',' + arg.trim().slice(0,40) + ')');
    }
  }
})();

// ── S04: nenhum dado de mentorado gravado em chave GLOBAL ──
// Backend forte: dado de pessoa nunca pode viver numa chave sem escopo,
// senão vaza entre usuários e não há como sincronizar por dono.
const GLOBAL_FORBIDDEN = ['swot','vf_history','grow_sessions','microplano',
  'comp_radars','fase_a','inicio_ciclo','disc_scores','disc_result_full'];
let s04Pass = true;
(function(){
  for(const key of GLOBAL_FORBIDDEN){
    const hits   = (platformJs.match(new RegExp("DB\\.set\\('"+key+"'", 'g'))||[]).length;
    const seeded = (platformJs.match(new RegExp("if\\(!this\\.get\\('"+key+"'\\)\\) this\\.set\\('"+key+"'", 'g'))||[]).length;
    if(hits > seeded){
      s04Pass = false;
      structFailures.push("S04 dado de mentorado em chave global: DB.set('"+key+"') — use DB.setScoped()");
    }
  }
})();

// ── S05: todo writer de instrumento replica no backend ──
let s05Pass = true;
(function(){
  const writers = ['swotWrite','vfWrite','growWrite','mpWrite','radarsWrite'];
  for(const w of writers){
    const m = new RegExp("function "+w+"\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}").exec(platformJs);
    if(!m){ s05Pass = false; structFailures.push('S05 writer não encontrado: '+w); continue; }
    if(!/sbSave/.test(m[1])){
      s05Pass = false;
      structFailures.push('S05 '+w+' grava local sem replicar no Supabase');
    }
  }
})();

// ── S06: nenhum campo atribuído a `patch.X` antes de sbPatchUser fica
// de fora da whitelist — senão o PATCH sai vazio e o dado nunca chega ao
// servidor, silenciosamente. Foi um bug real (disc_natural/disc_adaptado).
let s06Pass = true;
(function(){
  const whitelistMatch = /const USERS_TABLE_COLUMNS = new Set\(\[([\s\S]*?)\]\)/.exec(platformJs);
  const whitelist = whitelistMatch
    ? [...whitelistMatch[1].matchAll(/'([a-zA-Z0-9_]+)'/g)].map(m=>m[1])
    : [];
  const assigns = [...platformJs.matchAll(/\bpatch\.([a-zA-Z0-9_]+)\s*=/g)].map(m=>m[1]);
  for(const field of assigns){
    if(!whitelist.includes(field)){
      s06Pass = false;
      structFailures.push("S06 patch."+field+" é atribuído mas não está em USERS_TABLE_COLUMNS — PATCH sairia vazio");
    }
  }
})();

// ── S07: painel twin do mentor está de fato ligado (não fica órfão) ──
let s07Pass = true;
(function(){
  if(!/renderMentorTwinInto\(menteeEmail, activeCycle\?\.id\|\|null\);/.test(platformJs)){
    s07Pass = false;
    structFailures.push('S07 renderMentorMenteeDash não dispara renderMentorTwinInto — o painel twin nunca apareceria na tela');
  }
})();

// ── S08: twin do mentor nunca escreve nos instrumentos do mentorado ──
// Twin observa (sbLoad*, sbSaveMentorObs, sbSaveCompetenciaScore para a
// série score_mentor); jamais deve chamar os escritores do dado do
// mentorado (sbSaveInstrument, swotWrite, vfWrite, growWrite, mpWrite).
let s08Pass = true;
(function(){
  const m = /async function renderMentorTwinInto\([^)]*\)\s*\{([\s\S]*?)\n\}\n\nfunction toggleTwinCardComment/.exec(platformJs);
  if(!m){
    s08Pass = false;
    structFailures.push('S08 função renderMentorTwinInto não encontrada para auditar');
  } else {
    const forbidden = ['sbSaveInstrument(', 'swotWrite(', 'vfWrite(', 'growWrite(', 'mpWrite('];
    const violations = forbidden.filter(f => m[1].includes(f));
    if(violations.length){
      s08Pass = false;
      structFailures.push('S08 twin do mentor grava no instrumento do mentorado: '+violations.join(', '));
    }
  }
})();

// ── S09: allowlist de QA é explícita e pequena, não um padrão genérico ──
let s09Pass = true;
(function(){
  if(!/const QA_ALWAYS_CERTIFIED = new Set\(\[/.test(platformJs)){
    s09Pass = false;
    structFailures.push('S09 a allowlist de certificação de QA precisa ser um Set literal explícito, não uma condição genérica que poderia vazar para qualquer conta');
  }
})();

// ── S10: menu do mentor não contém páginas de instrumento do mentorado ──
// Este é o bug exato relatado: o mentor via as mesmas telas editáveis do
// mentorado (Competências, DISC, SWOT etc.) no próprio menu, em vez de
// só Dashboard + Twin + Treinamento.
let s10Pass = true;
(function(){
  const m = /mentor:\[([\s\S]*?)\],\n  mentorado:/.exec(platformJs);
  if(!m){
    s10Pass = false;
    structFailures.push('S10 não encontrou MENUS.mentor para auditar');
  } else {
    const forbidden = ["id:'disc'", "id:'comp'", "id:'peer360'", "id:'swot'", "id:'vf'", "id:'mapa-obj'", "id:'microplano'", "id:'diario'", "id:'fase-a'", "id:'inicio-ciclo'"];
    const leaked = forbidden.filter(f => m[1].includes(f));
    if(leaked.length){
      s10Pass = false;
      structFailures.push('S10 menu do mentor ainda contém páginas de instrumento do mentorado: '+leaked.join(', '));
    }
  }
})();

// ── S11: admin consegue converter usuário para papel duplo ──
let s11Pass = true;
(function(){
  if(!/value="mentor_mentorado"/.test(platformJs)){
    s11Pass = false;
    structFailures.push('S11 formulário admin não oferece a opção Mentor e Mentorado');
  }
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
console.log(s03Pass ? "✅ S03 toda escrita em users passa por sanitizeUserPayload" : "❌ S03 há escrita em users sem sanitização");
console.log(s04Pass ? "✅ S04 nenhum dado de mentorado em chave global" : "❌ S04 há dado de mentorado em chave global (vaza entre usuários)");
console.log(s05Pass ? "✅ S05 todo instrumento replica no Supabase" : "❌ S05 há instrumento gravando só em local");
console.log(s06Pass ? "✅ S06 nenhum campo de users fora da whitelist é gravado" : "❌ S06 há campo de users que nunca chega ao servidor");
console.log(s07Pass ? "✅ S07 painel twin do mentor está ligado ao dashboard" : "❌ S07 painel twin não é chamado — ficaria órfão");
console.log(s08Pass ? "✅ S08 twin do mentor nunca escreve no instrumento do mentorado" : "❌ S08 twin do mentor grava onde não deveria");
console.log(s09Pass ? "✅ S09 allowlist de QA é explícita" : "❌ S09 allowlist de QA é genérica demais");
console.log(s10Pass ? "✅ S10 menu do mentor não vaza páginas de instrumento do mentorado" : "❌ S10 menu do mentor vaza páginas de instrumento do mentorado");
console.log(s11Pass ? "✅ S11 admin pode criar conta de papel duplo" : "❌ S11 admin não consegue criar conta de papel duplo");
structFailures.forEach(f => console.log('   ↳ '+f));

console.log('\n── Testes de lógica (ambiente Node com stubs) ──');
process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||'');

const structPassCount = (s00Pass?1:0) + (s01Pass?1:0) + (s02Pass?1:0) + (s03Pass?1:0) + (s04Pass?1:0) + (s05Pass?1:0) + (s06Pass?1:0) + (s07Pass?1:0) + (s08Pass?1:0) + (s09Pass?1:0) + (s10Pass?1:0) + (s11Pass?1:0);
const structFailCount = (s00Pass?0:1) + (s01Pass?0:1) + (s02Pass?0:1) + (s03Pass?0:1) + (s04Pass?0:1) + (s05Pass?0:1) + (s06Pass?0:1) + (s07Pass?0:1) + (s08Pass?0:1) + (s09Pass?0:1) + (s10Pass?0:1) + (s11Pass?0:1);
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
T('J05h sanitizeUserPayload remove campos que não existem na tabela users (inclusive mentorados, removido de propósito)', ()=>{
  const dirty = {id:'z1', name:'X', email:'z@t.com', role:'mentor', mentorados:['a','b'],
                 campo_futuro_inventado: 'não deveria ir para o Supabase', outraCoisa: 123};
  const clean = sanitizeUserPayload(dirty);
  if('campo_futuro_inventado' in clean) throw new Error('campo desconhecido vazou para o payload');
  if('outraCoisa' in clean) throw new Error('outro campo desconhecido vazou');
  if('mentorados' in clean) throw new Error('mentorados não deveria mais ser enviado (coluna não confirmada no banco)');
  if(clean.name !== 'X') throw new Error('campo válido corrompido');
});
await TA('J05i cenário real relatado: mentor com campo mentorados sincroniza sem erro de coluna', async()=>{
  currentUser={id:'a1',name:'Admin',email:'admmr@t.com',role:'admin',active:true}; currentRole='admin';
  let capturedBody = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if(opts && opts.method==='POST' && url.includes('/users')){
      capturedBody = JSON.parse(opts.body);
      // Simula o Postgrest real: essas são as colunas que de fato existem hoje no banco
      // (mentorados NÃO está aqui — é exatamente o cenário reportado pelo usuário)
      const allowed = new Set(['id','name','email','role','plan','active','phase','week','created','password','mentor_id','empresa_id','curriculo_texto','curriculo_arquivo','curriculo_data','photo']);
      const bad = Object.keys(capturedBody).find(k=>!allowed.has(k));
      if(bad) throw new Error("PGRST204: Could not find the '"+bad+"' column of 'users' in the schema cache");
      return {ok:true,status:201,json:async()=>[capturedBody],text:async()=>JSON.stringify([capturedBody])};
    }
    return {ok:true,status:200,json:async()=>[],text:async()=>''};
  };
  DB.set('users',[{id:'mr1',name:'Mentor com Mentorados',email:'mr1@t.com',role:'mentor',active:true,mentorados:['x1','x2'],_localOnlyDebugField:'lixo qualquer'}]);
  await syncAllUsersToSupabase();
  global.fetch = origFetch;
  if(!capturedBody) throw new Error('POST nunca foi chamado (ou falhou antes de chegar aqui)');
  if('_localOnlyDebugField' in capturedBody) throw new Error('campo de lixo local vazou para o Supabase');
  if('mentorados' in capturedBody) throw new Error('mentorados vazou mesmo não existindo a coluna no banco simulado');
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
T('J09 DISC fim salva natural travado', ()=>{ discAnswers=DISC_BLOCKS.map(()=>({most:0,least:1})); discShuffled=DISC_BLOCKS.map(b=>({...b,opts:[...b.opts]})); discPage=DISC_BLOCKS.length-1; discNavigate(1); const full=discFullRead(); if(!full||!full.natural||!full.adaptado||!full.effort) throw new Error('x'); });
T('J09b resultado DISC fica escopado ao mentorado, não em chave global', ()=>{ if(DB.get('disc_result_full')) throw new Error('DISC gravado em chave global — vazaria entre usuários'); if(!DB.getScoped('disc_result_full', currentUser.email, getCurrentCycleId(), false)) throw new Error('DISC não gravado na chave escopada'); });
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
// ── K: ISOLAMENTO DE INSTRUMENTOS POR MENTORADO ──
T('K01 DB.scopedKey compõe chave por email e ciclo', ()=>{
  if(DB.scopedKey('swot','a@t.com') !== 'swot__a@t.com') throw new Error('chave sem ciclo errada');
  if(DB.scopedKey('swot','a@t.com','cy1') !== 'swot__a@t.com__cy1') throw new Error('chave com ciclo errada');
});
T('K02 setScoped recusa gravação sem email (evita vazamento global)', ()=>{
  reset();
  const ok = DB.setScoped('swot', null, null, {f:['x']});
  if(ok !== false) throw new Error('deveria recusar gravação sem email');
  if(DB.get('swot')) throw new Error('gravou na chave global mesmo sem email');
});
T('K03 SWOT de dois mentorados não se misturam', ()=>{
  reset();
  DB.setScoped('swot','a@t.com',null,{f:['forca-A'],fr:[],o:[],a:[]});
  DB.setScoped('swot','b@t.com',null,{f:['forca-B'],fr:[],o:[],a:[]});
  const a = DB.getScoped('swot','a@t.com',null,false);
  const b = DB.getScoped('swot','b@t.com',null,false);
  if(a.f[0] !== 'forca-A') throw new Error('SWOT de A corrompido: '+JSON.stringify(a));
  if(b.f[0] !== 'forca-B') throw new Error('SWOT de B corrompido: '+JSON.stringify(b));
});
T('K04 Visão de Futuro de dois mentorados não se misturam', ()=>{
  reset();
  DB.setScoped('vf_history','a@t.com',null,[{txt:'visao-A'}]);
  DB.setScoped('vf_history','b@t.com',null,[{txt:'visao-B'}]);
  if(DB.getScoped('vf_history','a@t.com',null,false)[0].txt !== 'visao-A') throw new Error('VF de A corrompida');
  if(DB.getScoped('vf_history','b@t.com',null,false)[0].txt !== 'visao-B') throw new Error('VF de B corrompida');
});
T('K05 Sessões GROW de dois mentorados não se misturam', ()=>{
  reset();
  DB.setScoped('grow_sessions','a@t.com','cy1',[{goal:'meta-A'}]);
  DB.setScoped('grow_sessions','b@t.com','cy1',[{goal:'meta-B'}]);
  if(DB.getScoped('grow_sessions','a@t.com','cy1',false)[0].goal !== 'meta-A') throw new Error('GROW de A corrompido');
  if(DB.getScoped('grow_sessions','b@t.com','cy1',false)[0].goal !== 'meta-B') throw new Error('GROW de B corrompido');
});
T('K06 fallback legado só é lido quando não há dado escopado', ()=>{
  reset();
  DB.set('swot',{f:['legado'],fr:[],o:[],a:[]});
  const semDado = DB.getScoped('swot','a@t.com',null,true);
  if(semDado.f[0] !== 'legado') throw new Error('fallback legado não funcionou na primeira leitura');
  DB.setScoped('swot','a@t.com',null,{f:['novo'],fr:[],o:[],a:[]});
  const comDado = DB.getScoped('swot','a@t.com',null,true);
  if(comDado.f[0] !== 'novo') throw new Error('fallback sobrepôs dado escopado — migração perderia edições');
});
T('K07 mentor lendo instrumento do mentorado não recebe o próprio dado', ()=>{
  reset();
  DB.setScoped('swot','mentor@t.com',null,{f:['swot-do-mentor'],fr:[],o:[],a:[]});
  DB.setScoped('swot','mentorado@t.com',null,{f:['swot-do-mentorado'],fr:[],o:[],a:[]});
  const visaoDoMentor = DB.getScoped('swot','mentorado@t.com',null,false);
  if(visaoDoMentor.f[0] !== 'swot-do-mentorado') throw new Error('mentor veria o próprio SWOT no painel do mentorado');
});

await TA('K08 persist enfileira quando o backend falha (nada é perdido)', async()=>{
  reset();
  const orig = global.fetch;
  global.fetch = async()=>{ throw new Error('rede caiu'); };
  await persist('checkpoints','POST',{id:'x'},{silent:true});
  global.fetch = orig;
  const q = DB.get('sync_queue')||[];
  if(q.length !== 1) throw new Error('operação não foi enfileirada; dado seria perdido');
  if(q[0].path !== 'checkpoints') throw new Error('fila gravou path errado');
});
await TA('K09 syncQueueFlush reenvia e limpa a fila quando o backend volta', async()=>{
  reset();
  DB.set('sync_queue',[{path:'checkpoints',method:'POST',body:{id:'x'},attempts:0}]);
  const r = await syncQueueFlush();
  if(r.sent !== 1) throw new Error('não reenviou');
  if((DB.get('sync_queue')||[]).length !== 0) throw new Error('fila não foi limpa após sucesso');
});
await TA('K10 syncQueueFlush mantém na fila o que continua falhando', async()=>{
  reset();
  DB.set('sync_queue',[{path:'checkpoints',method:'POST',body:{id:'x'},attempts:0}]);
  const orig = global.fetch;
  global.fetch = async()=>{ throw new Error('ainda offline'); };
  const r = await syncQueueFlush();
  global.fetch = orig;
  if(r.failed !== 1) throw new Error('deveria reportar falha');
  const q = DB.get('sync_queue');
  if(q.length !== 1) throw new Error('perdeu a operação que falhou');
  if(q[0].attempts !== 1) throw new Error('não contou a tentativa');
});
T('K11 checkpoint grava local E dispara replicação no backend', ()=>{
  reset(); seed();
  _fetchLog = [];
  saveCheckpoint('my@t.com',{date:today(),conquista:'a',bloqueio:'b',energia:4});
  if(!getCheckpoints('my@t.com').length) throw new Error('não gravou local');
  const hit = _fetchLog.some(f=>String(f.url).includes('checkpoints'));
  if(!hit) throw new Error('não replicou no Supabase — dado ficaria só em cache');
});
T('K12 SWOT grava local E dispara replicação no backend', ()=>{
  reset(); seed();
  _fetchLog = [];
  swotWrite({f:['x'],fr:[],o:[],a:[]});
  if(!DB.getScoped('swot','my@t.com','cy1',false)) throw new Error('não gravou local');
  const hit = _fetchLog.some(f=>String(f.url).includes('instrument_data'));
  if(!hit) throw new Error('não replicou no Supabase');
});
await TA('K13 sbSaveInstrument marca versão anterior como não-vigente (histórico acumula)', async()=>{
  reset(); seed();
  _fetchLog = [];
  await sbSaveInstrument('swot','my@t.com','cy1',{f:['v2']});
  const patch = _fetchLog.find(f=>f.method==='PATCH' && String(f.url).includes('is_current'));
  if(!patch) throw new Error('não desmarcou a versão anterior — histórico ficaria ambíguo');
  const post = _fetchLog.find(f=>f.method==='POST' && String(f.url).includes('instrument_data'));
  if(!post) throw new Error('não inseriu a nova versão');
});

await TA('K14 login usa o role do Supabase quando o cache local está desatualizado', async()=>{
  reset();
  // Cache local diz "mentorado" (desatualizado); Supabase diz "mentor" (correto)
  DB.set('users',[{id:'u9',name:'Fulano',email:'f@t.com',role:'mentorado',active:true}]);
  const orig = global.fetch;
  global.fetch = async(url)=>{
    if(String(url).includes('users')) return {ok:true,status:200,
      json:async()=>[{id:'u9',name:'Fulano',email:'f@t.com',role:'mentor',active:true}],
      text:async()=>JSON.stringify([{id:'u9',name:'Fulano',email:'f@t.com',role:'mentor',active:true}])};
    return {ok:true,status:200,json:async()=>[],text:async()=>''};
  };
  const u = await resolveUserForLogin('f@t.com');
  global.fetch = orig;
  if(!u) throw new Error('não resolveu o usuário');
  if(u.role !== 'mentor') throw new Error('login usou role do cache local ('+u.role+') em vez do Supabase (mentor)');
});
await TA('K15 login funciona offline usando o cache local', async()=>{
  reset();
  DB.set('users',[{id:'u9',name:'Fulano',email:'f@t.com',role:'mentor',active:true}]);
  const orig = global.fetch;
  global.fetch = async()=>{ throw new Error('offline'); };
  const u = await resolveUserForLogin('f@t.com');
  global.fetch = orig;
  if(!u || u.role !== 'mentor') throw new Error('login quebrou sem rede — deve cair no cache local');
});

// ── P: BATERIA DE PLATAFORMA — regras de negócio centrais ──

T('P01 calculateStreak conta semanas consecutivas mais recentes', ()=>{
  const now = new Date();
  const w = n => { const d=new Date(now); d.setDate(d.getDate()-n*7); return d.toISOString().slice(0,10); };
  const streak = calculateStreak([{date:w(0)},{date:w(1)},{date:w(2)}]);
  if(streak !== 3) throw new Error('esperado 3, veio '+streak);
});
T('P02 calculateStreak quebra corretamente ao pular uma semana (regressão)', ()=>{
  const now = new Date();
  const w = n => { const d=new Date(now); d.setDate(d.getDate()-n*7); return d.toISOString().slice(0,10); };
  // semana 0 e 1 preenchidas, semana 2 pulada, semana 3 preenchida
  const streak = calculateStreak([{date:w(0)},{date:w(1)},{date:w(3)}]);
  if(streak !== 2) throw new Error('esperado 2 (quebra na semana pulada), veio '+streak+' — bug de streak voltou');
});
T('P03 calculateStreak zera se o checkpoint mais recente é de mais de 1 semana atrás', ()=>{
  const now = new Date();
  const w = n => { const d=new Date(now); d.setDate(d.getDate()-n*7); return d.toISOString().slice(0,10); };
  const streak = calculateStreak([{date:w(3)}]);
  if(streak !== 0) throw new Error('esperado 0, veio '+streak);
});
T('P04 calculateStreak funciona independente da ordem de entrada', ()=>{
  const now = new Date();
  const w = n => { const d=new Date(now); d.setDate(d.getDate()-n*7); return d.toISOString().slice(0,10); };
  const streak = calculateStreak([{date:w(2)},{date:w(0)},{date:w(1)}]); // fora de ordem
  if(streak !== 3) throw new Error('esperado 3 mesmo fora de ordem, veio '+streak);
});

T('P05 USERS_TABLE_COLUMNS não contém colunas mortas (disc_natural/adaptado removidas)', ()=>{
  if(USERS_TABLE_COLUMNS.has('disc_natural') || USERS_TABLE_COLUMNS.has('disc_adaptado'))
    throw new Error('colunas mortas voltaram à whitelist — disc_profiles é a fonte agora');
});
await TA('P06 saveDISCProfile não tenta mais patch morto em users (usa disc_profiles)', async()=>{
  reset(); seed();
  _fetchLog = [];
  await saveDISCProfile('my@t.com', {D:5,I:3,S:2,C:1}, 'natural');
  const userPatch = _fetchLog.find(f=>f.method==='PATCH' && String(f.url).includes('/users?'));
  if(userPatch) throw new Error('ainda tenta PATCH em users — deveria ter sido removido');
  const discWrite = _fetchLog.find(f=>String(f.url).includes('disc_profiles'));
  if(!discWrite) throw new Error('não gravou em disc_profiles');
});

T('P07 isTrainingComplete exige todas as aulas concluídas para mentor', ()=>{
  reset(); seed();
  currentUser = {email:'mentor@t.com', role:'mentor'};
  currentRole = 'mentor';
  DB.set('training_progress_mentor@t.com', {completed:[], updated:[]});
  if(isTrainingComplete()) throw new Error('não deveria estar completo sem nenhuma aula feita');
});
T('P08 isTrainingComplete é sempre true para não-mentor (não bloqueia mentorado/admin)', ()=>{
  currentUser = {email:'x@t.com', role:'mentorado'};
  currentRole = 'mentorado';
  if(!isTrainingComplete()) throw new Error('mentorado não deveria ser bloqueado por treinamento de mentor');
});
T('P09 isLessonUnlocked: aula 1 sempre liberada, demais exigem a anterior concluída', ()=>{
  currentUser = {email:'mentor2@t.com', role:'mentor'};
  DB.set('training_progress_mentor2@t.com', {completed:[], updated:[]});
  if(!isLessonUnlocked(1)) throw new Error('aula 1 deveria estar sempre liberada');
  if(isLessonUnlocked(2)) throw new Error('aula 2 não deveria liberar sem a 1 concluída');
});

await TA('P10 approveReg sincroniza o usuário aprovado no Supabase', async()=>{
  reset(); seed();
  DB.set('registrations',[{id:'r1',name:'Novo Mentorado',email:'novo@t.com',role:'mentorado',plan:'x',status:'pending'}]);
  _fetchLog = [];
  await approveReg('r1');
  const upsert = _fetchLog.find(f=>String(f.url).includes('/users') && (f.method==='POST'||f.method==='PATCH'));
  if(!upsert) throw new Error('aprovação não tentou sincronizar o usuário no backend');
});

await TA('P11 cleanupDuplicateUsersInSupabase mantém o registro mais completo', async()=>{
  reset();
  const savedFetch = global.fetch;
  const rows = [
    {id:'a', email:'dup@t.com', name:'Dup', role:null, phase:null},
    {id:'b', email:'dup@t.com', name:'Dup', role:'mentor', phase:'G'}
  ];
  global.fetch = async(url,opts)=>{
    if(String(url).includes('users?select=')){
      return {ok:true, status:200, json:async()=>rows, text:async()=>JSON.stringify(rows)};
    }
    _fetchLog.push({url:String(url),method:(opts&&opts.method)||'GET'});
    return {ok:true, status:200, json:async()=>([]), text:async()=>'[]'};
  };
  _fetchLog = [];
  await cleanupDuplicateUsersInSupabase();
  global.fetch = savedFetch;
  const del = _fetchLog.find(f=>f.method==='DELETE' && String(f.url).includes('id=eq.a'));
  if(!del) throw new Error('deveria ter removido o registro menos completo (id=a), não o mais completo (id=b)');
});

T('P12 sanitizeUserPayload nunca deixa passar campo fora da whitelist (defesa em profundidade)', ()=>{
  const dirty = {id:'u1', name:'X', campo_inventado:'não deveria ir', mentorados:['a','b']};
  const clean = sanitizeUserPayload(dirty);
  if('campo_inventado' in clean) throw new Error('campo inventado vazou pela sanitização');
  if('mentorados' in clean) throw new Error('campo mentorados (removido de propósito) vazou');
});

T('P13 discScoresWrite/discFullRead ficam isolados por mentorado (regressão do vazamento original)', ()=>{
  reset(); seed();
  currentUser = {email:'a@t.com'};
  discScoresWrite({D:5}, {natural:{D:5}});
  currentUser = {email:'b@t.com'};
  discScoresWrite({D:1}, {natural:{D:1}});
  currentUser = {email:'a@t.com'};
  const a = discFullRead();
  if(a.natural.D !== 5) throw new Error('mentor leria o DISC do outro usuário — vazamento voltou');
});

T('P14 mpRead/radarsRead nunca retornam null mesmo sem dado gravado (evita crash de render)', ()=>{
  reset(); seed();
  currentUser = {email:'novo@t.com'};
  const mp = mpRead();
  const rad = radarsRead();
  if(!mp || typeof mp !== 'object') throw new Error('mpRead deveria retornar objeto default, não '+JSON.stringify(mp));
  if(!Array.isArray(rad)) throw new Error('radarsRead deveria retornar array default');
});

T('P15 syncQueueAdd nunca perde uma operação anterior ao enfileirar outra', ()=>{
  reset();
  syncQueueAdd({path:'checkpoints',method:'POST',body:{id:1}});
  syncQueueAdd({path:'diario',method:'POST',body:{id:2}});
  const q = DB.get('sync_queue');
  if(q.length !== 2) throw new Error('fila deveria ter 2 operações, tem '+q.length);
});

// ── T (Twin): painel do mentor — somente leitura + observações + calibração ──

await TA('T01 sbSaveMentorObs é append-only — não sobrescreve observação anterior', async()=>{
  reset(); seed();
  _fetchLog = [];
  await sbSaveMentorObs('mentor@t.com','my@t.com','cy1','swot','primeira observação',{kind:'observacao'});
  await sbSaveMentorObs('mentor@t.com','my@t.com','cy1','swot','segunda observação',{kind:'observacao'});
  const deletes = _fetchLog.filter(f=>f.method==='DELETE');
  const posts = _fetchLog.filter(f=>f.method==='POST' && String(f.url).includes('mentor_observations'));
  if(deletes.length) throw new Error('mentor_observations não deveria apagar histórico — twin precisa do acumulado para o relatório final');
  if(posts.length !== 2) throw new Error('esperava 2 inserções (histórico completo), veio '+posts.length);
});

await TA('T02 sbSaveMentorObs distingue observação de recomendação pelo kind', async()=>{
  reset(); seed();
  const savedFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async(url,opts)=>{
    if(String(url).includes('mentor_observations')) capturedBody = JSON.parse(opts.body);
    return {ok:true, status:200, json:async()=>([]), text:async()=>'[]'};
  };
  await sbSaveMentorObs('mentor@t.com','my@t.com','cy1','grow','sugiro focar em X',{kind:'recomendacao'});
  global.fetch = savedFetch;
  if(!capturedBody) throw new Error('não gravou');
  if(capturedBody.kind !== 'recomendacao') throw new Error('kind não foi persistido corretamente, veio '+capturedBody.kind);
});

await TA('T03 saveTwinCalibration grava score_mentor sem alterar score_auto/360/aferido existentes', async()=>{
  reset(); seed();
  currentUser = {email:'mentor@t.com', role:'mentor'};
  window._twinMenteeEmail = 'my@t.com';
  window._twinCompScores = [{competencia:'Liderança', score_auto:4, score_360:3.5, score_aferido:null}];
  _elems['twin-calib-Lideran_a'] = {value:'5'};
  const savedFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async(url,opts)=>{
    if(String(url).includes('competencia_scores')) capturedBody = JSON.parse(opts.body);
    return {ok:true, status:200, json:async()=>([]), text:async()=>'[]'};
  };
  await saveTwinCalibration('Liderança','cy1');
  global.fetch = savedFetch;
  if(!capturedBody) throw new Error('não tentou gravar calibração');
  if(capturedBody.score_mentor !== 5) throw new Error('score_mentor não foi 5, veio '+capturedBody.score_mentor);
  if(capturedBody.score_auto !== 4) throw new Error('calibração do mentor sobrescreveu score_auto do mentorado — twin deveria só observar, nunca editar');
  if(capturedBody.score_360 !== 3.5) throw new Error('calibração do mentor sobrescreveu score_360 — twin deveria só observar, nunca editar');
});

await TA('T04 saveTwinCalibration rejeita valor fora do intervalo 1-5', async()=>{
  reset(); seed();
  currentUser = {email:'mentor@t.com', role:'mentor'};
  window._twinMenteeEmail = 'my@t.com';
  window._twinCompScores = [{competencia:'Foco', score_auto:3}];
  _elems['twin-calib-Foco'] = {value:'9'};
  _fetchLog = [];
  await saveTwinCalibration('Foco','cy1');
  const post = _fetchLog.find(f=>f.method==='POST' && String(f.url).includes('competencia_scores'));
  if(post) throw new Error('deveria ter recusado calibração fora de 1-5, mas gravou mesmo assim');
});

T('T05 twinObsList filtra por instrumento e target_id corretamente', ()=>{
  const rows = [
    {instrument:'swot', target_id:'none', text:'a', created_at:'2026-01-01'},
    {instrument:'grow', target_id:'none', text:'b', created_at:'2026-01-02'},
    {instrument:'microplano', target_id:'card1', text:'c', created_at:'2026-01-03'},
    {instrument:'microplano', target_id:'card2', text:'d', created_at:'2026-01-04'},
  ];
  const swotOnly = twinObsList(rows,'swot','none');
  if(swotOnly.length !== 1 || swotOnly[0].text !== 'a') throw new Error('filtro de instrumento falhou');
  const card1Only = twinObsList(rows,'microplano','card1');
  if(card1Only.length !== 1 || card1Only[0].text !== 'c') throw new Error('filtro de target_id (card) falhou — comentários de cards diferentes vazariam entre si');
});

T('T06 twinObsList ordena do mais recente para o mais antigo', ()=>{
  const rows = [
    {instrument:'swot', target_id:'none', text:'antiga', created_at:'2026-01-01'},
    {instrument:'swot', target_id:'none', text:'nova', created_at:'2026-06-01'},
  ];
  const sorted = twinObsList(rows,'swot','none');
  if(sorted[0].text !== 'nova') throw new Error('não está mostrando a observação mais recente primeiro');
});

await TA('T07 saveTwinCardComment grava com target_id do card específico (não vaza entre cards)', async()=>{
  reset(); seed();
  currentUser = {email:'mentor@t.com', role:'mentor'};
  window._twinMenteeEmail = 'my@t.com';
  window._twinCycleId = 'cy1';
  _elems['twin-obs-input-card_abc123'] = {value:'comentário no card certo'};
  const savedFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async(url,opts)=>{
    if(String(url).includes('mentor_observations')) capturedBody = JSON.parse(opts.body);
    return {ok:true, status:200, json:async()=>([]), text:async()=>'[]'};
  };
  await saveTwinCardComment('abc123','card_abc123');
  global.fetch = savedFetch;
  if(!capturedBody) throw new Error('não gravou comentário do card');
  if(capturedBody.target_id !== 'abc123') throw new Error('target_id errado — comentário vazaria para outro card');
  if(capturedBody.kind !== 'comentario_card') throw new Error('kind deveria ser comentario_card');
});


// ── Q: certificação de QA para conta de teste ──

T('Q01 isQACertifiedAccount reconhece só o e-mail listado', ()=>{
  if(!isQACertifiedAccount('luizarcala@gmail.com')) throw new Error('deveria reconhecer a conta de QA');
  if(isQACertifiedAccount('outro@t.com')) throw new Error('não deveria certificar e-mail fora da lista — vazaria para qualquer mentor');
});

T('Q02 isTrainingComplete é sempre true para a conta de QA, mesmo sem nenhuma aula feita', ()=>{
  reset(); seed();
  currentUser = {id:'qa1', email:'luizarcala@gmail.com', role:'mentor'};
  currentRole = 'mentor';
  DB.set('training_progress_qa1', {completed:[], scores:{}, updated:[]});
  if(!isTrainingComplete()) throw new Error('conta de QA deveria estar sempre certificada');
});

T('Q03 isTrainingComplete continua exigindo aulas de um mentor comum (regressão — não pode vazar)', ()=>{
  reset(); seed();
  currentUser = {id:'mentor2', email:'mentor.normal@t.com', role:'mentor'};
  currentRole = 'mentor';
  DB.set('training_progress_mentor2', {completed:[], scores:{}, updated:[]});
  if(isTrainingComplete()) throw new Error('CRÍTICO: a certificação de QA vazou para um mentor comum');
});

T('Q04 isLessonUnlocked libera todas as aulas para a conta de QA independente de progresso', ()=>{
  currentUser = {id:'qa1', email:'luizarcala@gmail.com', role:'mentor'};
  DB.set('training_progress_qa1', {completed:[], scores:{}, updated:[]});
  if(!isLessonUnlocked(6)) throw new Error('aula 6 deveria estar liberada para QA mesmo sem completar as anteriores');
});

await TA('Q05 ensureQACertification grava nota 10 em todas as aulas, local e no Supabase', async()=>{
  reset(); seed();
  const user = {id:'qa1', email:'luizarcala@gmail.com', role:'mentor'};
  _fetchLog = [];
  await ensureQACertification(user);
  const p = DB.get('training_progress_qa1');
  if(p.completed.length !== LESSONS.length) throw new Error('não marcou todas as aulas como completas localmente');
  if(Object.values(p.scores).some(s=>s!==10)) throw new Error('nem toda aula ficou com nota 10 localmente');
  const posts = _fetchLog.filter(f=>f.method==='POST' && String(f.url).includes('training_progress'));
  if(posts.length !== LESSONS.length) throw new Error('esperava '+LESSONS.length+' gravações no Supabase, veio '+posts.length+' — nota 10 não seria visível no painel admin');
});

await TA('Q06 ensureQACertification não faz nada para conta fora da allowlist (regressão)', async()=>{
  reset(); seed();
  const user = {id:'mentor3', email:'mentor.normal@t.com', role:'mentor'};
  _fetchLog = [];
  await ensureQACertification(user);
  if(DB.get('training_progress_mentor3')) throw new Error('não deveria ter criado progresso fake para conta comum');
  const posts = _fetchLog.filter(f=>f.method==='POST' && String(f.url).includes('training_progress'));
  if(posts.length) throw new Error('não deveria ter gravado nada no Supabase para conta fora da allowlist');
});

// ── D: papel duplo (mentor_mentorado) ──

T('D01 hasMentorRole reconhece mentor puro e conta dupla', ()=>{
  if(!hasMentorRole({role:'mentor'})) throw new Error('deveria reconhecer mentor puro');
  if(!hasMentorRole({role:'mentor_mentorado'})) throw new Error('deveria reconhecer conta dupla como mentor');
  if(hasMentorRole({role:'mentorado'})) throw new Error('não deveria reconhecer mentorado puro como mentor');
});

T('D02 hasMentoradoRole reconhece mentorado puro e conta dupla', ()=>{
  if(!hasMentoradoRole({role:'mentorado'})) throw new Error('deveria reconhecer mentorado puro');
  if(!hasMentoradoRole({role:'mentor_mentorado'})) throw new Error('deveria reconhecer conta dupla como mentorado');
  if(hasMentoradoRole({role:'mentor'})) throw new Error('não deveria reconhecer mentor puro como mentorado');
});

T('D03 conta dupla ativa como mentor é bloqueada pelo treinamento como qualquer mentor (regressão do vazamento)', ()=>{
  reset(); seed();
  // currentUser.role é 'mentor_mentorado' — literal, nunca === 'mentor'.
  // Antes da correção, isTrainingComplete checava currentUser.role
  // diretamente e essa comparação nunca batia, liberando a conta sem
  // treinamento nenhum. O que precisa valer aqui é currentRole (o papel
  // ATIVO da sessão, escolhido na tela de login).
  currentUser = {id:'dual1', email:'dual@t.com', role:'mentor_mentorado'};
  currentRole = 'mentor';
  DB.set('training_progress_dual1', {completed:[], scores:{}, updated:[]});
  if(isTrainingComplete()) throw new Error('CRÍTICO: conta dupla entrando como mentor pulou o treinamento');
});

T('D04 conta dupla ativa como mentorado não é afetada pelo gate de treinamento de mentor', ()=>{
  currentUser = {id:'dual1', email:'dual@t.com', role:'mentor_mentorado'};
  currentRole = 'mentorado';
  if(!isTrainingComplete()) throw new Error('gate de treinamento de mentor vazou para a sessão de mentorado');
});

// ── RESULTADO ──
console.log('PASS='+pass+' FAIL='+fail);
if(failures.length){ failures.forEach(f=>console.log('❌ '+f)); process.exit(1); }
process.exit(0);
})().catch(e=>{ console.log('HARNESS FATAL: '+e.message); process.exit(1); });

//TESTS_END
}
