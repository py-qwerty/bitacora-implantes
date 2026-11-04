import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../dist/core.js';
function fixture(){const courses=[{id:'sistemas',title:'Sistemas',shortTitle:'Sistemas'},{id:'redes',title:'Redes',shortTitle:'Redes'}];const topics=[{id:11,course:'sistemas',number:1,title:'Windows Server'},{id:12,course:'sistemas',number:2,title:'Linux'},{id:21,course:'redes',number:1,title:'Redes'}];const questions=topics.flatMap(t=>Array.from({length:30},(_,i)=>({id:`${t.course}-${t.number}-${i}`,course:t.course,topic:t.id,test:'Tema '+t.number,order:i+1,text:`Caso ${t.id}/${i}`,options:['a','b','c','d'].map(key=>({key,text:'Opción '+key})),correct:'abcd'[i%4],explanation:'La razón de la respuesta <debe> explicarse.',difficulty:'media',source:{kind:'practice',title:t.title,page:5}})));return {version:'test',courses,topics,questions};}
function runtime(){
 const elements=new Map();const events={};let ctx;
 const element=()=>({hidden:true,open:false,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){},remove(){},add(){}},style:{removeProperty(){}},addEventListener(){},focus(){},setAttribute(){},removeAttribute(){},querySelector(selector){if(selector==='h1'){const m=this.innerHTML.match(/<h1[^>]*>(.*?)<\/h1>/s);return m?{innerText:m[1].replace(/<[^>]+>/g,'')}:null;}return null},querySelectorAll(){return[]},showModal(){this.open=true;},close(){this.open=false;}});
 const get=s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);};
 const storage=new Map();const document={querySelector:get,querySelectorAll:()=>[],addEventListener:(k,fn)=>{(events[k]??=[]).push(fn)},activeElement:get('focus'),hidden:false};
 document.body=element();
 const window={addEventListener(){},scrollX:0,scrollY:0,scrollTo(){},innerHeight:700};
 const sandbox={...core,document,window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),key:i=>[...storage.keys()][i],get length(){return storage.size}},location:{hash:'#/temas'},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,URLSearchParams,Map,Set,Date,Math,JSON,Number,String,Object,Array,performance:{now:()=>0},crypto:{randomUUID:()=> 'simulation-1'},matchMedia:()=>({matches:true}),innerWidth:390};
 ctx=vm.createContext(sandbox);const script=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*?;\n/,'').replace(/init\(\);\s*$/,'');
 vm.runInContext(script+`\nglobalThis.api={seed(data){bank=data;questionMap=new Map(bank.questions.map(q=>[q.id,q]));practiceMap=new Map(bank.topics.map(t=>[t.id,practiceBlocks(bank.questions,t.id)]));},home,coursePage,topicPage,practicePage,setup,resultsPage,historyPage,explanation,read,write,getPractice,savePractice,autoAdvanceEnabled,navigationContext,render,startExam,session:()=>session,temaPage,seedTema(n,data){temaIndex.set(n,{topic:n,sections:data.sections.length,minutes:data.minutes});temaCache.set(n,{status:'ready',data});}};`,ctx);
 ctx.api.seed(fixture());return {api:ctx.api,ctx,elements,get,events,storage};
}
test('subject hierarchy and all30 entry render without simulation state',()=>{const {api}=runtime();assert.match(api.home(),/Asignaturas/);assert.match(api.coursePage('sistemas'),/Windows Server/);assert.match(api.topicPage(11),/Test completo/);assert.match(api.topicPage(11),/#\/practica\/11\/0/);assert.match(api.setup(),/45 minutos es orientativa/);});
test('automatic advancement defaults off and feedback includes escaped rationale and source',()=>{const {api}=runtime();assert.equal(api.autoAdvanceEnabled(),false);const p=api.getPractice(11,1);p.answers[p.ids[0]]='a';p.checked=[p.ids[0]];api.savePractice(p);const html=api.practicePage(11,1);assert.match(html,/Por qué es correcta/);assert.match(html,/&lt;debe&gt;/);assert.match(html,/Página 5/);assert.match(html,/Pregunta de práctica/);assert.doesNotMatch(html,/<debe>/);});
test('full30 practice renders dynamic count and has distinct storage key',()=>{const {api}=runtime();const full=api.getPractice(11,0);assert.equal(full.ids.length,30);full.answers[full.ids[0]]='a';api.savePractice(full);assert.match(api.practicePage(11,0),/\/ 30/);assert.equal(Object.keys(api.getPractice(11,1).answers).length,0);});
test('completed practice error review is bounded and read-only',()=>{const {api,ctx}=runtime();const p=api.getPractice(11,1);p.answers[p.ids[0]]='a';p.finishedAt=Date.now();p.checked=[...p.ids];api.savePractice(p);ctx.location.hash='#/practica/11/1?repaso=1&filtro=errores';const html=api.practicePage(11,1);assert.match(html,/\/ 9/);assert.match(html,/disabled/);assert.match(html,/Sin responder/);assert.equal(api.navigationContext().total,9);});
test('invalid route is a recoverable app page and updates its title',()=>{const {api,ctx,get}=runtime();ctx.location.hash='#/tema/999';api.render(false);assert.match(get('#main').innerHTML,/No encontramos esa página/);assert.match(ctx.document.title,/No encontramos/);});
test('starting simulation respects subject chooser and has a45min deadline',()=>{const {api,get}=runtime();get('#simulation-course').value='redes';api.startExam();const s=api.session();assert.equal(s.ids.length,30);assert.ok(s.ids.every(id=>id.startsWith('redes')));assert.equal(s.deadline-s.startedAt,45*60*1000);assert.equal(api.read('session:'+s.id),null);});

test('storage failure preserves progress in memory and warns honestly',()=>{const {api,ctx,get}=runtime();ctx.localStorage.setItem=()=>{throw Error('blocked')};api.write('sample',{value:7});assert.equal(api.read('sample').value,7);assert.equal(get('#notice').hidden,false);assert.match(get('#notice').textContent,/se perderá al cerrar/);});
test('malformed stored JSON safely starts a new practice and stays writable',()=>{const {api,storage,get}=runtime();storage.set('bitacora-implantes:v1:practice:11:1','{bad');const p=api.getPractice(11,1);assert.equal(Object.keys(p.answers).length,0);assert.match(get('#notice').textContent,/datos guardados no válidos/);p.answers[p.ids[0]]='a';api.savePractice(p);assert.equal(api.getPractice(11,1).answers[p.ids[0]],'a');});
test('checking then editing resets feedback without advancing by default',()=>{const {api,ctx,events,get}=runtime();ctx.location.hash='#/practica/11/1';const target={name:'practice-answer',value:'a'};events.change[0]({target});let p=api.getPractice(11,1);assert.equal(p.index,0);assert.equal(p.answers[p.ids[0]],'a');const button={dataset:{action:'practice-check'},disabled:false};const click={target:{closest:s=>s==='[data-action]'?button:null},preventDefault(){},stopImmediatePropagation(){}};for(const callback of events.click)callback(click);assert.match(get('#main').innerHTML,/Por qué es correcta/);target.value='b';events.change[0]({target});p=api.getPractice(11,1);assert.equal(p.index,0);assert.equal(p.checked.length,0);assert.doesNotMatch(get('#main').innerHTML,/Por qué es correcta/);});
test('keyboard-activated skip link focuses content without changing the current route',()=>{
 const {api,ctx,events,get}=runtime();
 for(const route of ['#/temas','#/practica/11/1']){
  ctx.location.hash=route;api.render(false);
  const before=get('#main').innerHTML;let focused=false,prevented=false;
  get('#main').focus=()=>{focused=true;};
  const link={};
  const click={detail:0,target:{closest:selector=>selector==='.skip'?link:null},preventDefault(){prevented=true;},stopImmediatePropagation(){}};
  for(const callback of events.click)callback(click);
  assert.equal(prevented,true);
  assert.equal(focused,true);
  assert.equal(ctx.location.hash,route);
  assert.equal(get('#main').innerHTML,before);
 }
});

test('topic material offers relative open/download links with a descriptive filename',()=>{
 const {api}=runtime();const data=fixture();data.topics[0].material={url:'materials/sistemas/tema-01-seguridad-en-windows-server.pdf',format:'pdf',pages:41,bytes:123456,title:'Seguridad en Windows Server'};api.seed(data);
 const html=api.topicPage(11);
 assert.match(html,/Material del tema/);
 assert.match(html,/Tema 1\. Seguridad en Windows Server/);
 assert.match(html,/41 páginas · 124 kB/);
 assert.equal((html.match(/href="materials\/sistemas\/tema-01-seguridad-en-windows-server\.pdf"/g)||[]).length,2);
 assert.match(html,/target="_blank" rel="noopener"/);
 assert.match(html,/download="Tema 1\. Seguridad en Windows Server\.pdf"/);
 assert.doesNotMatch(html,/href="\/materials\//);
});
test('missing material or unsafe URL omits document controls rather than creating a broken link',()=>{
 const {api}=runtime();assert.doesNotMatch(api.topicPage(11),/Material del tema|href="materials/);
 for(const url of ['javascript:alert(1)','https://example.com/tema.pdf','/materials/a.pdf','materials/../a.pdf','materials/a/%2e%2e/a.pdf','materials/a.pdf" onclick="bad','materials/a.pdf?redirect=other']){
  const data=fixture();data.topics[0].material={url,format:'pdf',title:'Nombre'};api.seed(data);assert.doesNotMatch(api.topicPage(11),/Material del tema|Descargar PDF/);
 }
});
test('document labels escape content and download filename removes control and filename characters',()=>{
 const {api}=runtime();const data=fixture();data.topics[0].material={url:'materials/sistemas/tema-01.pdf',format:'pdf',title:'Tema 1. Redes <seguras> / "caso"',pages:0,bytes:NaN};api.seed(data);const html=api.topicPage(11);
 assert.match(html,/Tema 1\. Redes &lt;seguras&gt; \/ &quot;caso&quot;/);
 assert.match(html,/download="Tema 1\. Redes -seguras- - -caso-\.pdf"/);
 assert.doesNotMatch(html,/<seguras>|NaN|0 páginas/);
});
test('practice PDF access preserves saved answers and position and opens separately',()=>{
 const {api}=runtime();const data=fixture();data.topics[0].material={url:'materials/sistemas/tema-01.pdf',format:'pdf',title:'Windows Server'};api.seed(data);const p=api.getPractice(11,1);p.index=4;p.answers[p.ids[0]]='b';api.savePractice(p);const html=api.practicePage(11,1);
 assert.match(html,/Consultar tema en PDF/);assert.match(html,/target="_blank" rel="noopener"/);assert.match(html,/mantienes tu avance/);
 const saved=api.getPractice(11,1);assert.equal(saved.index,4);assert.equal(saved.answers[p.ids[0]],'b');
});
test('subject topics stay numerically ordered and have explicit unduplicated topic names',()=>{
 const {api}=runtime();const data=fixture();data.topics.reverse();data.topics.find(t=>t.id===11).title='Tema 1. Windows Server';api.seed(data);const html=api.coursePage('sistemas');
 assert.ok(html.indexOf('Tema 1. Windows Server')<html.indexOf('Tema 2. Linux'));
 assert.doesNotMatch(html,/Tema 1\. Tema 1/);
 assert.match(api.topicPage(11),/<h1>Tema 1\. Windows Server<\/h1>/);
});

function temaFixture(){
 const questions=Object.fromEntries(Array.from({length:30},(_,i)=>[`sistemas-1-${i}`,{section:i<20?'dominio':'gpo',reasoning:'Razona **paso a paso** <b>sin HTML</b>.',options:{a:'Motivo A',b:'Motivo B',c:'Motivo C',d:'Motivo D'},...(i===3?{doubt:'Clave discutible'}:{})}]));
 return {course:'sistemas',number:1,title:'Windows Server',minutes:30,intro:{why:'Porque **importa**.',before:['Saber qué es un PC'],goals:['Explicar un dominio']},sections:[{id:'dominio',title:'El dominio',pages:[5,7],blocks:[{type:'p',text:'Un **dominio** agrupa equipos.'},{type:'analogy',text:'Como una oficina.'},{type:'table',head:['Nivel','Aplica'],rows:[['Dominio','Comunes']]},{type:'exam',text:'Trampa típica.'},{type:'code',title:'XSS',text:'<script>alert(1)</script>'}]},{id:'gpo',title:'Directivas',blocks:[{type:'key',text:'Idea clave.'}]}],summary:['Resumen 1'],glossary:[{term:'GPO',text:'Objeto de directiva'}],questions};
}
test('digital topic renders sections, grouped argued questions, page links and escaped rich text',()=>{
 const {api}=runtime();const data=fixture();data.topics[0].material={url:'materials/sistemas/tema-01.pdf',format:'pdf',title:'Windows Server'};api.seed(data);api.seedTema(11,temaFixture());
 const html=api.temaPage(11);
 assert.match(html,/Sistemas, tema 1/);assert.match(html,/<span class="sr-only">Apartado 1\. <\/span>El dominio/);assert.match(html,/Un <strong>dominio<\/strong> agrupa equipos/);
 assert.match(html,/href="materials\/sistemas\/tema-01\.pdf#page=5"/);assert.match(html,/Páginas 5–7 del PDF/);
 assert.match(html,/Pon a prueba este apartado <span>20<\/span>/);assert.match(html,/Pon a prueba este apartado <span>10<\/span>/);
 assert.match(html,/<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;b&gt;sin HTML&lt;\/b&gt;/);assert.doesNotMatch(html,/<b>sin HTML/);
 assert.match(html,/Para revisar:<\/b> Clave discutible/);assert.match(html,/#\/tema\/11\/estudio\?apartado=gpo/);assert.match(html,/Glosario/);
 assert.match(api.topicPage(11),/Estudiar el tema →/);assert.match(api.coursePage('sistemas'),/Tema digital/);assert.doesNotMatch(api.topicPage(12),/Estudiar el tema/);
});
test('checked practice feedback links to the digital topic section and argues every option',()=>{
 const {api,ctx}=runtime();api.seedTema(11,temaFixture());ctx.location.hash='#/practica/11/1';const p=api.getPractice(11,1);p.answers[p.ids[0]]='b';p.checked=[p.ids[0]];api.savePractice(p);
 const html=api.practicePage(11,1);
 assert.match(html,/Argumentación opción por opción/);assert.match(html,/Motivo D/);assert.match(html,/Repasar en el tema digital: El dominio/);assert.match(html,/✕ Incorrecta · Tu respuesta/);
});
test('topic without digital content has no digital route',()=>{const {api}=runtime();assert.match(api.temaPage(11),/No encontramos esa página/);});
