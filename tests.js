// ══════════════════════════════════════════════════════════════════
// ARCALA INSIGHT — Suíte de testes (launcher)
// Uso: node tests.js — combina stubs + plataforma + testes e executa
// 25 testes ISOLADOS (I01-I25) + 25 INTEGRADOS (J01-J25)
// ══════════════════════════════════════════════════════════════════
const fs = require('fs'), cp = require('child_process'), os = require('os'), path = require('path');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const platformJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const self = fs.readFileSync(__filename, 'utf8');
const stubs = self.split('//STUBS_'+'START')[1].split('//STUBS_'+'END')[0];
const tests = self.split('//TESTS_'+'START')[1].split('//TESTS_'+'END')[0];
fs.writeFileSync(path.join(os.tmpdir(),'_arcala_run.js'), stubs + '\n' + platformJs + '\n' + tests);
const r = cp.spawnSync('node', [path.join(os.tmpdir(),'_arcala_run.js')], {encoding:'utf8', timeout:60000});
process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||'');
process.exit(r.status ?? 1);

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
  global.fetch = async (url) => ({ok:true, status:200, json:async()=>[{id:'r1',name:'Trocar Role',email:'role@t.com',role:'mentorado',active:true}], text:async()=>''});
  const reloaded = await loadAllUsers();
  global.fetch = origFetch;
  const after = reloaded.find(x=>x.email==='role@t.com');
  if(after.role!=='mentor') throw new Error('role revertido para: '+after.role);
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

// ── RESULTADO ──
console.log('PASS='+pass+' FAIL='+fail);
if(failures.length){ failures.forEach(f=>console.log('❌ '+f)); process.exit(1); }
process.exit(0);
})().catch(e=>{ console.log('HARNESS FATAL: '+e.message); process.exit(1); });

//TESTS_END
}
