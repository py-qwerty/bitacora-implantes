import { DURATION, EXAM_SIZE, generateExam, gradeExam, remaining, formatTime, isValidSession, practiceBlocks, topicQuestions, validPractice, swipeDirection, validateBank, validateTema } from './core.js?v=5';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString('es-ES');
const PREFIX = 'bitacora-implantes:v1:';
const memory = new Map();
let storageFailed = false;
function warnStorage() {
  storageFailed = true;
  $('#notice').hidden = false;
  $('#notice').textContent = 'No se puede guardar el progreso en este navegador. Puedes continuar, pero se perderá al cerrar esta página.';
}
function read(key, fallback = null) {
  if (storageFailed && memory.has(key)) return memory.get(key);
  let raw;
  try { raw = localStorage.getItem(PREFIX + key); }
  catch { warnStorage(); return memory.get(key) ?? fallback; }
  if(!raw)return memory.get(key) ?? fallback;
  try { return JSON.parse(raw); }
  catch {
    $('#notice').hidden=false;
    $('#notice').textContent='Se han descartado datos guardados no válidos. Puedes continuar con una práctica nueva.';
    return memory.get(key) ?? fallback;
  }
}
function write(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
  catch { warnStorage(); }
}
let bank, questionMap, practiceMap, temaIndex = new Map(), temaCache = new Map(), timer, session = null, reviewFilter = 'errors', reviewPage = 0;
const main = $('#main');
const seenIds = () => { const ids = read('seen', []); return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []); };
const currentRoute = () => {
  const [path, query = ''] = (location.hash.slice(1) || '/temas').split('?');
  return { path, params: new URLSearchParams(query) };
};
function namedTopic(topic,title=topic?.title){
  if(!topic)return '';
  const subject=String(title||topic.title).replace(/^Tema\s+\d+\s*[.:–—-]?\s*/i,'').trim();
  return `Tema ${topic.number}. ${subject}`;
}
const topicTitle = n => namedTopic(bank.topics.find(t => t.id === n)) || `Tema ${n}`;
const courseTitle = id => bank.courses.find(c=>c.id===id)?.shortTitle || bank.courses.find(c=>c.id===id)?.title || id;
const topicInfo = n => bank.topics.find(t=>t.id===n);
const topicBadge = n => `<span class="topic-tag" aria-label="Tema ${topicInfo(n)?.number ?? n}">${String(topicInfo(n)?.number ?? n).padStart(2,'0')}</span>`;
const sourceLabel = kind => ({'clase':'Explicado en clase','practice':'Pregunta de práctica'}[kind] || 'Material de estudio');
function explanation(q){return `<aside class="answer-explanation"><h3>Por qué es correcta</h3><p>${esc(q.explanation)}</p><p class="source-note">${esc(sourceLabel(q.source?.kind))} · ${esc(q.source?.title)}${q.source?.page?' · Página '+esc(q.source.page):''}</p></aside>`;}
function topicMaterial(topic){
  const m=topic?.material;
  // Only bundled relative PDF paths are accepted, preserving a GitHub Pages subpath.
  // No host, root path, query, fragment, encoded path or traversal may enter href.
  if(!m||m.format!=='pdf'||typeof m.url!=='string'||!/^materials\/[a-z0-9][a-z0-9/_-]*\.pdf$/i.test(m.url))return null;
  return m;
}
function materialMeta(m){
  const parts=['PDF'];
  if(Number.isInteger(m.pages)&&m.pages>0)parts.push(number(m.pages)+' páginas');
  if(Number.isFinite(m.bytes)&&m.bytes>0){
    const value=m.bytes>=1000000?m.bytes/1000000:Math.ceil(m.bytes/1000);
    parts.push(value.toLocaleString('es-ES',{maximumFractionDigits:1})+(m.bytes>=1000000?' MB':' kB'));
  }
  return parts.join(' · ');
}
function materialFilename(topic,m){
  const title=namedTopic(topic,m.title||topic.title).replace(/\.pdf$/i,'');
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim()+'.pdf';
}
function materialBlock(topic){
  const m=topicMaterial(topic);if(!m)return '';
  return `<section class="topic-material" aria-labelledby="topic-material-title"><h2 id="topic-material-title">Material del tema</h2><p class="material-title">${esc(namedTopic(topic,m.title||topic.title))}</p><p class="material-meta">${esc(materialMeta(m))}</p><div class="material-actions"><a class="btn" href="${esc(m.url)}" target="_blank" rel="noopener">Abrir tema <span aria-hidden="true">↗</span><span class="sr-only"> (se abre en otra pestaña)</span></a><a class="btn secondary" href="${esc(m.url)}" download="${esc(materialFilename(topic,m))}">Descargar PDF</a></div></section>`;
}
function practiceMaterial(topic){
  const m=topicMaterial(topic);if(!m)return '';
  return `<p class="practice-material"><a href="${esc(m.url)}" target="_blank" rel="noopener">Consultar tema en PDF <span aria-hidden="true">↗</span><span class="sr-only"> (se abre en otra pestaña)</span></a><span>Se abre aparte; mantienes tu avance en el test.</span></p>`;
}
const rich = value => esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
function loadTema(n){
  if(!temaIndex.has(n))return null;
  const cached=temaCache.get(n);if(cached)return cached;
  const entry={status:'loading',data:null};temaCache.set(n,entry);
  fetch(`temas/${n}.json?v=${encodeURIComponent(bank.version)}`,{signal:AbortSignal.timeout(15000)})
    .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
    .then(data=>{validateTema(data,bank);entry.status='ready';entry.data=data;})
    .catch(()=>{entry.status='error';})
    .finally(()=>{const {path}=currentRoute();if(path.startsWith(`/tema/${n}`)||path.startsWith(`/practica/${n}/`))render(false);});
  return entry;
}
const temaReady = n => { const e=loadTema(n); return e?.status==='ready'?e.data:null; };
const sectionHref = (n,id) => `#/tema/${n}/estudio?apartado=${encodeURIComponent(id)}`;
function pageLinks(topic,pages){
  const m=topicMaterial(topic);if(!Array.isArray(pages)||!pages.length)return '';
  const label=pages.length>1&&pages[pages.length-1]!==pages[0]?`Páginas ${pages[0]}–${pages[pages.length-1]}`:`Página ${pages[0]}`;
  return m?`<a class="page-ref" href="${esc(m.url)}#page=${pages[0]}" target="_blank" rel="noopener">${label} del PDF <span aria-hidden="true">↗</span></a>`:`<span class="page-ref">${label} del PDF</span>`;
}
function temaBlock(b){
  const title=b.title?`<h4>${rich(b.title)}</h4>`:'';
  switch(b.type){
    case 'p':return `<p>${rich(b.text)}</p>`;
    case 'analogy':return `<aside class="tb tb-analogy"><span class="tb-label">Imagínalo así</span>${title}<p>${rich(b.text)}</p></aside>`;
    case 'term':return `<dl class="tb tb-term"><dt>${rich(b.term)}</dt><dd>${rich(b.text)}</dd></dl>`;
    case 'list':return `<div class="tb-list">${title}<ul>${b.items.map(i=>`<li>${rich(i)}</li>`).join('')}</ul></div>`;
    case 'steps':return `<div class="tb-list">${title}<ol class="tb-steps">${b.items.map(i=>`<li>${rich(i)}</li>`).join('')}</ol></div>`;
    case 'table':return `<div class="tb-table">${title}<div class="table-wrap"><table><thead><tr>${b.head.map(h=>`<th scope="col">${rich(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r=>`<tr>${r.map((c,i)=>i===0?`<th scope="row">${rich(c)}</th>`:`<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    case 'example':return `<aside class="tb tb-example"><span class="tb-label">Ejemplo</span>${title}<p>${rich(b.text)}</p></aside>`;
    case 'exam':return `<aside class="tb tb-exam"><span class="tb-label">Así cae en el test</span>${title}<p>${rich(b.text)}</p></aside>`;
    case 'code':return `<figure class="tb-code">${b.title?`<figcaption>${rich(b.title)}</figcaption>`:''}<pre><code>${esc(b.text)}</code></pre></figure>`;
    case 'key':return `<aside class="tb tb-key"><span class="tb-label">Idea clave</span><p>${rich(b.text)}</p></aside>`;
    default:return '';
  }
}
function arguedOptions(q,arg,selected){
  return `<ol class="argued-options">${q.options.map(o=>{const ok=o.key===q.correct;return `<li class="${ok?'is-correct':'is-wrong'}${selected===o.key?' is-selected':''}"><span class="option-letter">${o.key.toUpperCase()}</span><div><p class="argued-option-text">${esc(o.text)} <strong class="answer-label">${ok?'✓ Correcta':'✕ Incorrecta'}${selected===o.key?' · Tu respuesta':''}</strong></p><p>${rich(arg.options[o.key])}</p></div></li>`;}).join('')}</ol>`;
}
function temaQuestion(q,arg){
  const kind='';
  return `<details class="tq" id="pregunta-${esc(q.id)}"><summary><span class="tq-number">${q.order}</span><span class="tq-text">${esc(q.text)}</span></summary><div class="tq-body">${kind}<ol class="tq-options">${q.options.map(o=>`<li><span class="option-letter">${o.key.toUpperCase()}</span><span>${esc(o.text)}</span></li>`).join('')}</ol><details class="tq-answer"><summary>Ver respuesta argumentada</summary><p class="tq-solution">Respuesta correcta: <b>${q.correct.toUpperCase()}</b></p><p class="tq-reasoning">${rich(arg.reasoning)}</p>${arguedOptions(q,arg)}${arg.doubt?`<p class="tq-doubt"><b>Para revisar:</b> ${rich(arg.doubt)}</p>`:''}</details></div></details>`;
}
function temaPage(n){
  const topic=topicInfo(n);if(!topic||!temaIndex.has(n))return notFound();
  const entry=loadTema(n);const back=`<a class="back-link" href="#/tema/${n}">← ${esc(topicTitle(n))}</a>`;
  if(entry.status==='loading')return `${back}<div class="loading"><span class="spinner" aria-hidden="true"></span><p>Cargando el tema digital…</p></div>`;
  if(entry.status==='error')return `${back}${heading('No se ha podido cargar el tema digital.','Comprueba tu conexión y vuelve a intentarlo.')}<button class="btn" data-action="tema-retry" data-topic="${n}">Volver a intentarlo</button>`;
  const t=entry.data;const qs=topicQuestions(bank.questions,n);
  const bySection=new Map(t.sections.map(s=>[s.id,[]]));qs.forEach(q=>bySection.get(t.questions[q.id].section)?.push(q));
  const intro=t.intro;
  const facts=[`<li><b>${t.sections.length}</b> apartados</li>`,t.minutes?`<li><b>${t.minutes}</b> min de lectura</li>`:'',`<li><b>${qs.length}</b> preguntas argumentadas</li>`].join('');
  return `${back}<header class="tema-hero"><div class="tema-hero-main"><p class="tema-kicker">${esc(courseTitle(topic.course))}, tema ${topic.number}<span class="sr-only">. Tema digital</span></p><h1>${esc(topicTitle(n).replace(/^Tema \d+\.\s*/,''))}</h1><ul class="tema-facts">${facts}</ul><p class="tema-why">${rich(intro.why)}</p></div>${intro.before||intro.goals?`<div class="tema-intro">${intro.before?`<section class="tema-before"><h2>Antes de empezar</h2><ul>${intro.before.map(i=>`<li>${rich(i)}</li>`).join('')}</ul></section>`:''}${intro.goals?`<section class="tema-goals"><h2>Al terminar sabrás</h2><ul>${intro.goals.map(i=>`<li>${rich(i)}</li>`).join('')}</ul></section>`:''}</div>`:''}</header>
<div class="tema-layout"><nav class="tema-index" aria-label="Apartados del tema"><details open><summary>Apartados</summary><ol>${t.sections.map((s,i)=>`<li><a href="${sectionHref(n,s.id)}" data-section="${esc(s.id)}"><span class="tema-index-number">${i+1}</span><span>${esc(s.title)}</span>${bySection.get(s.id).length?`<small>${bySection.get(s.id).length} preg.</small>`:''}</a></li>`).join('')}${t.summary?`<li><a href="${sectionHref(n,'resumen')}" data-section="resumen"><span class="tema-index-number">✓</span><span>Resumen</span></a></li>`:''}${t.glossary?`<li><a href="${sectionHref(n,'glosario')}" data-section="glosario"><span class="tema-index-number">Aa</span><span>Glosario</span></a></li>`:''}</ol></details><a class="btn secondary full" href="#/practica/${n}/0">Test completo de 30 →</a></nav>
<article class="tema-body">${t.sections.map((s,i)=>{const list=bySection.get(s.id);return `<section class="tema-section" id="apartado-${esc(s.id)}" aria-labelledby="titulo-${esc(s.id)}"><div class="tema-section-content"><header class="tema-section-head"><span class="tema-section-number" aria-hidden="true">${i+1}</span><div><h2 id="titulo-${esc(s.id)}"><span class="sr-only">Apartado ${i+1}. </span>${esc(s.title)}</h2><p class="tema-section-meta">${pageLinks(topic,s.pages)}${list.length?`<span>${list.length} ${list.length===1?'pregunta':'preguntas'} del test</span>`:''}</p></div></header>${s.blocks.map(temaBlock).join('')}</div>${list.length?`<aside class="tema-section-questions" aria-label="Preguntas del apartado ${i+1}"><h3>Pon a prueba este apartado <span>${list.length}</span></h3><p class="small">Intenta responder antes de abrir la argumentación.</p>${list.map(q=>temaQuestion(q,t.questions[q.id])).join('')}</aside>`:''}</section>`;}).join('')}
${t.summary?`<section class="tema-section tema-summary" id="apartado-resumen"><div class="tema-section-content"><h2>Resumen: lo que tienes que saber</h2><ul>${t.summary.map(i=>`<li>${rich(i)}</li>`).join('')}</ul></div></section>`:''}
${t.glossary?`<section class="tema-section tema-glossary-section" id="apartado-glosario"><div class="tema-section-content"><h2>Glosario</h2><dl class="tema-glossary">${t.glossary.map(g=>`<div><dt>${rich(g.term)}</dt><dd>${rich(g.text)}</dd></div>`).join('')}</dl></div></section>`:''}
<p class="local-note">Explicación propia elaborada a partir de las clases para estudiar desde cero. Ante cualquier duda manda lo que diga tu profesor y el material oficial.</p></article></div>`;
}
function temaCard(topic){
  if(!temaIndex.has(topic.id))return '';
  const info=temaIndex.get(topic.id);
  return `<section class="tema-card" aria-labelledby="tema-card-title"><h2 id="tema-card-title">Tema digital</h2><p>Explicado paso a paso, con ejemplos, y con las ${topicQuestions(bank.questions,topic.id).length} preguntas del test respondidas y argumentadas opción por opción.</p><p class="material-meta">${info.sections} apartados${info.minutes?` · ${info.minutes} min de lectura`:''}</p><a class="btn" href="#/tema/${topic.id}/estudio">Estudiar el tema →</a></section>`;
}
function temaFeedback(q,selected){
  if(!temaIndex.has(q.topic))return '';
  const t=temaReady(q.topic);if(!t)return `<p class="tema-feedback-loading small">Cargando la argumentación del tema digital…</p>`;
  const arg=t.questions[q.id];const section=t.sections.find(s=>s.id===arg.section);
  return `<details class="tema-feedback"><summary>Argumentación opción por opción</summary><p class="tq-reasoning">${rich(arg.reasoning)}</p>${arguedOptions(q,arg,selected)}${arg.doubt?`<p class="tq-doubt"><b>Para revisar:</b> ${rich(arg.doubt)}</p>`:''}</details><a class="tema-feedback-link" href="${sectionHref(q.topic,arg.section)}">Repasar en el tema digital: ${esc(section.title)} →</a>`;
}
function practiceIds(p){const params=currentRoute().params;return p.finishedAt&&params.get('repaso')==='1'&&params.get('filtro')==='errores'?p.ids.filter(id=>p.answers[id]!==questionMap.get(id).correct):p.ids;}
function blockLabel(b){return b===0?'Test completo':'Test '+b;}
function eyebrow(text) { return `<p class="eyebrow">${text}</p>`; }
function heading(title, text, tag = 'TU CUADERNO DE NAVEGACIÓN') {
  return `<div class="page-heading"><h1>${title}</h1>${text ? `<p class="lead">${text}</p>` : ''}</div>`;
}
function questionImage(q) { return q.image ? `<figure class="question-image"><img src="${esc(q.image)}" width="600" height="360" loading="lazy" alt="Ilustración del enunciado. Consulta los detalles de la imagen para resolver la pregunta."><figcaption>Imagen original del banco de preguntas</figcaption></figure>` : ''; }
function optionsRead(q, selected, showCorrect = false) {
  return `<ol class="read-options">${q.options.map(o => `<li class="${showCorrect && o.key === q.correct ? 'correct' : ''} ${showCorrect && selected === o.key && selected !== q.correct ? 'incorrect' : ''}"><span class="option-letter">${o.key.toUpperCase()}</span><span>${esc(o.text)}${showCorrect && o.key === q.correct ? '<strong class="answer-label">Respuesta correcta</strong>' : ''}${showCorrect && selected === o.key ? '<strong class="answer-label">Tu respuesta</strong>' : ''}</span></li>`).join('')}</ol>`;
}
function activeSession() { return session && !session.finishedAt ? session : null; }
function getPractice(topic, block) {
  const blocks=practiceMap.get(topic)||[]; const ids=(block===0?topicQuestions(bank.questions,topic):blocks[block-1])?.map(q=>q.id);
  if(!ids)return null;
  const saved=read(`practice:${topic}:${block}`);
  return saved?.topic===topic&&saved?.block===block&&validPractice(saved,ids,questionMap) ? saved : {topic,block,ids,index:0,answers:{},checked:[],finishedAt:null};
}
function savePractice(p){write(`practice:${p.topic}:${p.block}`,p);}
function autoAdvanceEnabled(){return read('autoAdvance',false)===true;}
function autoAdvanceControl(){
  return `<label class="auto-advance" for="auto-advance"><span>Avance automático<small>Pasar a la siguiente al responder</small></span><span class="switch-toggle"><input id="auto-advance" type="checkbox" role="switch" ${autoAdvanceEnabled()?'checked':''}><span class="switch-track" aria-hidden="true"></span></span></label>`;
}
function swipeHint() { return '<p class="swipe-hint">← Desliza para cambiar de pregunta →<span class="sr-only">También puedes elegir el número de pregunta o usar las flechas del teclado fuera de las respuestas.</span></p>'; }
function questionButtons(index,total,lastAction='',lastLabel='') {
  const last=index===total-1;
  return `<div class="exam-pagination"><button class="btn secondary" data-action="question-step" data-direction="-1" ${index===0?'disabled':''}>← Anterior</button><button class="btn" data-action="${last&&lastAction?lastAction:'question-step'}" data-direction="1" ${last&&!lastAction?'disabled':''}>${last&&lastLabel?lastLabel:'Siguiente →'}</button></div>`;
}
function numberNavigation(index,total,kind) {
  return `<details class="number-navigation"><summary>Ir a pregunta <span>${index+1} / ${total}</span></summary><div class="question-dots">${Array.from({length:total},(_,i)=>`<button type="button" class="question-dot ${i===index?'current':''}" data-action="question-jump" data-index="${i}" aria-label="Ir a pregunta ${i+1}" ${i===index?'aria-current="step"':''}>${i+1}</button>`).join('')}</div></details>`;
}
function practicePage(topic,block) {
  const p=getPractice(topic,block);if(!p)return notFound();
  const reviewing=currentRoute().params.get('repaso')==='1'&&!!p.finishedAt;
  const ids=practiceIds(p);p.index=Math.min(p.index,Math.max(0,ids.length-1));
  const count=Object.keys(p.answers).length;const score=p.ids.filter(id=>p.answers[id]===questionMap.get(id).correct).length;
  if(p.finishedAt&&!reviewing)return `<a class="back-link" href="#/tema/${topic}">← Tests del tema</a>${heading('Test terminado',`${esc(topicTitle(topic))} · ${blockLabel(block)}`)}<section class="practice-result"><span class="practice-score">${score}<small>/${p.ids.length}</small></span><h2>${score===p.ids.length?'Todo correcto':'Sigue aprendiendo'}</h2><p>${p.ids.length-count} en blanco · ${count-score} incorrectas</p><button class="btn full" data-action="practice-review" data-topic="${topic}" data-block="${block}">Repasar respuestas</button>${score<p.ids.length?`<button class="btn secondary full" data-action="practice-errors" data-topic="${topic}" data-block="${block}">Repasar errores y blancos (${p.ids.length-score})</button>`:''}<button class="btn secondary full" data-action="practice-reset" data-topic="${topic}" data-block="${block}">Repetir test</button><a class="btn text full" href="#/tema/${topic}">Volver a los tests</a></section>`;
  if(!ids.length)return `${heading('No hay errores que repasar','Todas las respuestas de este test son correctas.')}<a class="btn" href="#/practica/${topic}/${block}">Ver resultado</a>`;
  const q=questionMap.get(ids[p.index]);const checked=reviewing||p.checked.includes(q.id);const selected=p.answers[q.id];
  return `<a class="back-link" href="#/tema/${topic}">← Tests del tema</a><div class="practice-heading"><div><p class="eyebrow">${esc(courseTitle(q.course))} · TEMA ${topicInfo(topic).number} · ${blockLabel(block).toUpperCase()}</p><h1>Pregunta ${p.index+1}<span> / ${ids.length}</span></h1></div><span class="saved-label">${storageFailed?'Sin guardar':'Guardado'}</span></div><progress class="practice-progress" value="${reviewing?ids.length:count}" max="${reviewing?ids.length:p.ids.length}" aria-label="Preguntas respondidas"></progress>${reviewing?'':autoAdvanceControl()}<section class="question-panel practice-panel"><h2 class="exam-question">${esc(q.text)}</h2>${questionImage(q)}<fieldset class="answer-options"><legend class="sr-only">Elige una respuesta</legend>${q.options.map(o=>`<label class="answer-option ${selected===o.key?'selected':''} ${checked&&q.correct===o.key?'is-correct':''} ${checked&&selected===o.key&&selected!==q.correct?'is-incorrect':''}"><input type="radio" name="practice-answer" value="${o.key}" ${reviewing?'disabled':''} ${selected===o.key?'checked':''}><span class="option-letter">${o.key.toUpperCase()}</span><span>${esc(o.text)}${checked&&q.correct===o.key?'<strong class="answer-label">✓ Respuesta correcta</strong>':''}${checked&&selected===o.key&&selected!==q.correct?'<strong class="answer-label">✕ Tu respuesta</strong>':''}</span></label>`).join('')}</fieldset>${checked?`<p class="practice-feedback ${selected===q.correct?'right':'wrong'}" role="status">${selected===q.correct?'✓ Correcto':selected?'La respuesta correcta es '+q.correct.toUpperCase()+'.':'Sin responder. La respuesta correcta es '+q.correct.toUpperCase()+'.'}</p>${explanation(q)}${temaFeedback(q,selected)}`:`<button class="btn secondary full check-answer" data-action="practice-check" ${selected?'':'disabled'}>Comprobar respuesta</button>`}${questionButtons(p.index,ids.length,'practice-finish',reviewing?'Ver resultado':'Terminar test')}${swipeHint()}${numberNavigation(p.index,ids.length,'practice')}</section><p class="local-note">${reviewing?'Revisión del test terminado.':'Respuestas y posición guardadas en este navegador.'}</p>${practiceMaterial(topicInfo(topic))}`;
}
function home() {
  const active=activeSession();
  return `${heading('Asignaturas','Implantología, una pregunta cada vez.')}<div class="progress-summary"><span><b>${number(bank.questions.length)}</b> preguntas con explicación</span><span>${bank.courses.length} asignaturas</span></div>${active?`<a class="resume-link" href="#/examen"><span><b>Simulacro en curso</b><small>${Object.keys(active.answers).length} de ${active.ids.length} respondidas · El reloj sigue corriendo</small></span><span aria-hidden="true">→</span></a>`:''}<section class="topic-list" aria-label="Asignaturas">${bank.courses.map((c,i)=>{const topics=bank.topics.filter(t=>t.course===c.id);const done=topics.reduce((n,t)=>n+practiceMap.get(t.id).filter((_,j)=>getPractice(t.id,j+1).finishedAt).length,0);return `<a class="topic-card" href="#/asignatura/${esc(c.id)}"><span class="unit-number">${String(i+1).padStart(2,'0')}</span><div><h2>${esc(c.shortTitle||c.title)}</h2><p>${topics.length} temas · ${bank.questions.filter(q=>q.course===c.id).length} preguntas${done?' · '+done+' tests terminados':''}</p></div><span class="row-arrow" aria-hidden="true">›</span></a>`;}).join('')}</section><p class="local-note">30 preguntas por tema. Tu progreso se guarda solo en este navegador.</p><a class="rules-link" href="#/reglas">Cómo estudiar y procedencia de las preguntas ↗</a>`;
}
function coursePage(id){
  const course=bank.courses.find(c=>c.id===id);if(!course)return notFound();
  const topics=bank.topics.filter(t=>t.course===id).sort((a,b)=>a.number-b.number);
  return `<a class="back-link" href="#/temas">← Asignaturas</a>${heading(esc(course.shortTitle||course.title),'30 preguntas por tema · Explicaciones y fuente al comprobar')}<section class="topic-list" aria-label="Temas de la asignatura">${topics.map(t=>{const done=practiceMap.get(t.id).filter((_,i)=>getPractice(t.id,i+1).finishedAt).length;return `<a class="topic-card" href="#/tema/${t.id}"><span class="unit-number">${String(t.number).padStart(2,'0')}</span><div><h2>${esc(topicTitle(t.id))}</h2><p>${!practiceMap.get(t.id).length?'En preparación':`${temaIndex.has(t.id)?'<span class="tema-pill">Tema digital</span> ':''}3 tests de 10 · Test completo de 30${done?' · '+done+' terminados':''}`}</p></div><span class="row-arrow" aria-hidden="true">›</span></a>`;}).join('')}</section>${bank.questions.filter(q=>q.course===id).length>=30?`<a class="btn secondary full course-sim" href="#/simulacro?asignatura=${esc(id)}">Simulacro de esta asignatura →</a>`:''}`;
}
function topicPage(n,params){
  const topic=topicInfo(n);if(!topic)return notFound();
  if(!(practiceMap.get(n)||[]).length)return `<a class="back-link" href="#/asignatura/${esc(topic.course)}">← Temas de ${esc(courseTitle(topic.course))}</a>${heading(esc(topicTitle(n)),'Tema en preparación')}<p class="local-note">Este tema se está elaborando a partir de la clase. Vuelve pronto.</p>`;
  const blocks=practiceMap.get(n);const completed=blocks.filter((_,i)=>getPractice(n,i+1).finishedAt).length;
  const row=(qs,b)=>{const p=getPractice(n,b);const count=Object.keys(p.answers).length;const correct=p.ids.filter(id=>p.answers[id]===questionMap.get(id).correct).length;return `<a class="test-row" href="#/practica/${n}/${b}"><span class="test-number">${b||'30'}</span><div><h2>${blockLabel(b)}</h2><p>${p.finishedAt?`${correct}/${qs.length} aciertos · Terminado`:count?`${count}/${qs.length} respondidas · Continuar`:qs.length+' preguntas'}</p></div><span class="test-state">${p.finishedAt?'✓':count?'Continuar':'›'}</span></a>`;};
  return `<a class="back-link" href="#/asignatura/${esc(topic.course)}">← Temas de ${esc(courseTitle(topic.course))}</a>${heading(esc(topicTitle(n)),'30 preguntas con explicación')}<div class="topic-columns"><div class="topic-study">${temaCard(topic)}${materialBlock(topic)}</div><div class="topic-tests"><div class="progress-summary"><span>${completed} de 3 bloques terminados</span><span>Avance guardado</span></div><section class="test-list" aria-label="Tests del tema">${blocks.map((qs,i)=>row(qs,i+1)).join('')}${row(topicQuestions(bank.questions,n),0)}</section><p class="local-note">El test completo contiene las mismas 30 preguntas de los tres bloques, con progreso independiente. Pulsa «Comprobar respuesta» para entender cada solución.</p></div></div>`;
}
function distributionTable(result){
  if(!result)return '';
  return `<div class="table-wrap"><table><caption class="sr-only">Resultado por tema</caption><thead><tr><th scope="col">Tema</th><th scope="col">Aciertos</th><th scope="col">Blancos</th></tr></thead><tbody>${result.byTopic.map(row=>`<tr><th scope="row">${esc(courseTitle(topicInfo(row.topic).course))} · ${esc(topicTitle(row.topic))}</th><td>${row.correct}/${row.total}</td><td>${row.blank}</td></tr>`).join('')}</tbody></table></div>`;
}
function setup(){
 const active=activeSession();const selected=currentRoute().params.get('asignatura')||read('simulationCourse','');
 return `${heading('Simulacro','30 preguntas mezcladas para comprobar lo aprendido.')} ${active?`<aside class="resume-panel"><strong>Simulacro en curso</strong><p>${Object.keys(active.answers).length} de ${active.ids.length} respondidas. El reloj sigue corriendo.</p><a class="btn" href="#/examen">Continuar simulacro →</a></aside>`:''}<section class="exam-brief"><form id="simulation-settings" novalidate><label class="field-label" for="simulation-course">Asignatura</label><select id="simulation-course" name="course"><option value="">Todas las asignaturas</option>${bank.courses.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.shortTitle||c.title)}</option>`).join('')}</select><div class="exam-numbers"><div><b>30</b><span>preguntas</span></div><div><b>45</b><span>minutos de práctica</span></div></div><h2>Practica sin pistas</h2><p class="brief-text">Responde, cambia tu elección o marca las preguntas que quieras revisar. Las explicaciones aparecen al entregar.</p><p class="small">Es una práctica personal: no reproduce un examen oficial ni establece ninguna nota oficial. Sin penalización por error. La duración de 45 minutos es orientativa.</p><p class="small">El reloj no se pausa. Si cierras o recargas, se pierde el intento. Solo se guarda el resultado final.</p><button type="button" class="btn full start-exam" data-action="start">${active?'Empezar otro simulacro':'Empezar simulacro'} →</button><p class="small start-note">${active?'Se entregará el actual antes de empezar otro.':'El tiempo empieza al pulsar.'}</p></form></section>`;
}
function renderExam() {
  session = activeSession();
  if (!session) { main.innerHTML = `${heading('No hay un simulacro en marcha.','Al recargar o cerrar se descarta el intento. Puedes iniciar otro o consultar los resultados ya entregados.')}<a class="btn" href="#/simulacro">Preparar simulacro →</a>`; return; }
  if (remaining(session.deadline) === 0) { finish(true); return; }
  const q=questionMap.get(session.ids[session.index]); const answered=Object.keys(session.answers).length;
  main.innerHTML = `<div class="exam-top"><div><p class="eyebrow">SIMULACRO DE PRÁCTICA · EN CURSO</p><p class="exam-position">Pregunta <b>${session.index+1}</b> de ${session.ids.length}</p></div><div class="clock-box"><span>Tiempo restante</span><strong id="clock" role="timer" aria-label="Tiempo restante">${formatTime(remaining(session.deadline))}</strong></div><button class="btn secondary" data-action="submit">Entregar simulacro</button></div>${autoAdvanceControl()}<div class="exam-layout"><section class="question-panel"><div class="question-meta">${topicBadge(q.topic)}<span>${esc(topicTitle(q.topic))}</span></div><h1 class="exam-question">${esc(q.text)}</h1>${questionImage(q)}<fieldset class="answer-options"><legend class="sr-only">Elige una respuesta</legend>${q.options.map(o=>`<label class="answer-option ${session.answers[q.id]===o.key?'selected':''}"><input type="radio" name="answer" value="${o.key}" ${session.answers[q.id]===o.key?'checked':''}><span class="option-letter">${o.key.toUpperCase()}</span><span>${esc(o.text)}</span></label>`).join('')}</fieldset><div class="question-tools"><button class="btn text" data-action="flag" aria-pressed="${session.flags.includes(q.id)}">${session.flags.includes(q.id)?'⚑ Marcada para revisar':'⚐ Marcar para revisar'}</button><button class="btn text" data-action="clear-answer" ${session.answers[q.id]?'':'disabled'}>Borrar respuesta</button></div>${questionButtons(session.index,session.ids.length,'submit','Entregar simulacro')}${swipeHint()}</section><aside class="question-navigator" aria-label="Navegación de preguntas"><details class="navigator-disclosure"><summary>Hoja de respuestas <span>${answered}/${session.ids.length}</span></summary><p id="answered-count">${answered} respondidas · ${session.ids.length-answered} en blanco</p><div class="question-dots">${session.ids.map((id,i)=>`<button type="button" class="question-dot ${session.answers[id]?'answered':''} ${session.flags.includes(id)?'flagged':''} ${i===session.index?'current':''}" data-action="jump" data-index="${i}" aria-label="Pregunta ${i+1}, ${session.answers[id]?'respondida':'en blanco'}${session.flags.includes(id)?', marcada para revisar':''}" ${i===session.index?'aria-current="step"':''}>${i+1}${session.flags.includes(id)?'<span aria-hidden="true">•</span>':''}</button>`).join('')}</div><div class="navigator-key"><span><i class="key-answered"></i>Respondida</span><span><i></i>En blanco</span><span><b>•</b>Para revisar</span></div><p class="small">Este simulacro no guarda el avance. Al recargar se pierde. Las soluciones se ven al entregar.</p></details><a href="#/simulacro" class="back-link">Salir y continuar después</a></aside></div>`;
  tick();
  timer=setInterval(tick,1000);
}
function tick() {
  if(!session || session.finishedAt) return;
  const left=remaining(session.deadline);
  const clock=$('#clock'); if(clock) { clock.textContent=formatTime(left); clock.classList.toggle('time-low',left<5*60*1000); }
  if(left===0)finish(true);
}
function updateSession(change) {
  if(!session||session.finishedAt){render();return false;}
  if(remaining(session.deadline)===0){finish(true);return false;}
  change(session);return true;
}
function finish(expired=false) {
  const s=activeSession(); if(!s) return;
  if($('#dialog').open)$('#dialog').close();
  clearInterval(timer);
  s.finishedAt = Math.min(Date.now(),s.deadline);s.expired=expired;
  s.result=gradeExam(s.ids.map(id=>questionMap.get(id)),s.answers);
  write('session:'+s.id,s);
  session=null; location.hash='/resultado/'+s.id;
}
function startExam() {
  const course=$('#simulation-course')?.value||'';write('simulationCourse',course);const selected=generateExam(bank.questions,course);
  const now=Date.now();const id=crypto.randomUUID();
  session={id,ids:selected.map(q=>q.id),answers:{},flags:[],index:0,startedAt:now,deadline:now+DURATION,bankVersion:bank.version,course};
  location.hash='/examen';
}
const dateFormat = ms => new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}).format(new Date(ms));
function resultsPage(id){
 const s=read('session:'+id);if(!isValidSession(s,questionMap)||!s.finishedAt)return notFound();
 const questions=s.ids.map(id=>questionMap.get(id));const r=gradeExam(questions,s.answers);const filtered=questions.filter(q=>reviewFilter==='all'||s.answers[q.id]!==q.correct);
 return `<a class="back-link" href="#/historial">← Mi bitácora</a>${heading('Tu resultado',dateFormat(s.startedAt)+' · '+(s.expired?'Tiempo agotado':'Simulacro entregado'))}<section class="practice-result simulation-result"><span class="practice-score">${r.correct}<small>/${r.total}</small></span><h2>${r.score.toLocaleString('es-ES',{maximumFractionDigits:1})} sobre 10 en esta práctica</h2><p>${r.wrong} incorrectas · ${r.blank} en blanco · ${formatTime(Math.min(DURATION,s.finishedAt-s.startedAt))}</p></section><details class="result-breakdown"><summary>Resultado por temas</summary>${distributionTable(r)}</details><div class="section-head"><div><h2>Repasar respuestas</h2></div><div class="segmented" aria-label="Filtrar revisión"><button class="${reviewFilter==='errors'?'active':''}" data-action="review-filter" data-filter="errors" aria-pressed="${reviewFilter==='errors'}">Errores y blancos (${r.errors})</button><button class="${reviewFilter==='all'?'active':''}" data-action="review-filter" data-filter="all" aria-pressed="${reviewFilter==='all'}">Todas (${r.total})</button></div></div>${filtered.length?filtered.slice(Math.min(reviewPage,filtered.length-1),Math.min(reviewPage,filtered.length-1)+1).map(q=>`<article class="study-question"><div class="question-meta"><span>Pregunta ${s.ids.indexOf(q.id)+1}</span>${topicBadge(q.topic)}<span>${esc(topicTitle(q.topic))}</span><strong>${s.answers[q.id]===q.correct?'✓ Correcta':s.answers[q.id]?'✕ Incorrecta':'— En blanco'}</strong></div><h2>${esc(q.text)}</h2>${optionsRead(q,s.answers[q.id],true)}${explanation(q)}</article>`).join(''):'<div class="empty-state"><h3>¡Todas correctas!</h3><p>No hay errores ni preguntas en blanco en este simulacro.</p></div>'}${filtered.length?`${questionButtons(Math.min(reviewPage,filtered.length-1),filtered.length)}${swipeHint()}${numberNavigation(Math.min(reviewPage,filtered.length-1),filtered.length,'review')}`:''}<div class="actions"><a class="btn" href="#/simulacro">Otro simulacro →</a><a class="btn secondary" href="#/temas">Volver a las asignaturas</a></div><p class="local-note">Resultado de práctica personal; no es una calificación del campus.</p>`;
}
function historyPage(){
 const keys=new Set([...memory.keys()]);try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX+'session:'))keys.add(k.slice(PREFIX.length));}}catch{warnStorage();}
 const sessions=[...keys].filter(k=>k.startsWith('session:')).map(k=>read(k)).filter(s=>isValidSession(s,questionMap)&&s.finishedAt).sort((a,b)=>b.startedAt-a.startedAt);const active=activeSession();
 return `${heading('Mi bitácora','Tus simulacros entregados, guardados en este navegador.')}${active?'<a class="btn full" href="#/examen">Continuar simulacro en curso →</a>':''}${sessions.length?`<div class="history-list">${sessions.map(s=>{const r=gradeExam(s.ids.map(id=>questionMap.get(id)),s.answers);return `<a class="history-row" href="#/resultado/${esc(s.id)}"><div><h2>${s.course?esc(courseTitle(s.course)):'Todas las asignaturas'}</h2><p>${dateFormat(s.startedAt)}${s.expired?' · Tiempo agotado':''}</p></div><strong>${r.correct}<small>/${r.total}</small></strong><span aria-hidden="true">›</span></a>`;}).join('')}</div>`:'<div class="empty-state"><img src="assets/notebook.svg" width="68" height="68" alt=""><h2>Un lugar para tus avances.</h2><p>Al entregar un simulacro podrás consultar su resultado y entender tus errores.</p><a class="btn" href="#/simulacro">Preparar un simulacro →</a></div>'}<p class="local-note">Solo se guarda en este navegador. Los tests de cada tema conservan su progreso en la pantalla del tema. Borrar los datos del navegador elimina todo el progreso. No se sincroniza entre dispositivos.</p>`;
}
function rulesPage(){
 const counts=bank.questions.reduce((m,q)=>(m[q.source.kind]=(m[q.source.kind]||0)+1,m),{});
 return `${heading('Cómo estudiar y fuentes','Preguntas para practicar y entender lo que respondes.')}<section class="prose"><h2>Un tema, treinta preguntas</h2><p>Elige una asignatura y un tema. Puedes practicar en tres bloques de diez o hacer las treinta seguidas. El test completo contiene las mismas preguntas de los bloques y conserva su propio progreso.</p><h2>Comprende cada respuesta</h2><p>Selecciona una opción y pulsa «Comprobar respuesta». Verás la solución, su explicación y la página del material. El avance automático empieza desactivado para que puedas leer la retroalimentación. Si lo activas, pasarás al elegir una respuesta nueva.</p><h2>Tema digital</h2><p>Cada tema es un resumen ordenado de una clase: por qué importa, apartados con ejemplos, glosario y el razonamiento de cada pregunta. Al comprobar una respuesta puedes saltar al apartado donde se explica.</p><h2>Procedencia</h2><ul>${['clase','practice'].map(k=>`<li><b>${esc(sourceLabel(k))}:</b> ${number(counts[k]||0)} preguntas.</li>`).join('')}</ul><p>Las preguntas explicadas en clase salen de lo que se dijo en esa sesión. Las de práctica son ejercicios añadidos a partir del tema. Ninguna es un examen oficial: son apuntes de estudio y pueden contener errores de transcripción o de interpretación.</p><h2>Simulacros personales</h2><p>Treinta preguntas distintas, de una asignatura o de todas, en cuarenta y cinco minutos orientativos. Sin penalización por error ni umbral oficial de aprobado. Las explicaciones se muestran al entregar. La nota expresa únicamente los aciertos de esta práctica.</p><h2>Tu progreso</h2><p>Los tests guardan respuestas, explicaciones comprobadas y posición en este navegador. Los simulacros solo guardan el resultado final; cerrar o recargar descarta el intento en curso. Si el navegador impide guardar, aparecerá un aviso y podrás continuar en memoria.</p><h2>Uso del material</h2><p>Cuaderno de estudio personal, sin cuentas ni seguimiento. No es material oficial de la universidad ni del profesorado: ante cualquier duda clínica o técnica, consulta las fuentes oficiales y a tu profesor.</p></section>`;
}
function notFound() { return `${heading('No encontramos esa página.','La página o el simulacro ya no está disponible en este navegador.')}<a class="btn" href="#/temas">Volver a las asignaturas</a>`; }
function render(focus=true) {
  if(!bank)return;
  cancelQuestionTransition();
  clearInterval(timer);timer=null;
  const {path,params}=currentRoute();
  const nav=path.startsWith('/tema')||path.startsWith('/asignatura')||path.startsWith('/practica')?'temas':path.startsWith('/simulacro')||path==='/examen'?'simulacro':path.startsWith('/historial')||path.startsWith('/resultado')?'historial':'';
  document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===nav)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const wide=/^\/tema\/\d+\/estudio$/.test(path);
  main.className=path==='/examen'?'exam-main':wide?'wide-main':'';
  document.body.classList.toggle('route-wide',wide);
  document.body.classList.toggle('in-exam',path==='/examen');
  if(path==='/examen')renderExam();
  else if(path==='/temas'||path==='/')main.innerHTML=home();
  else if(/^\/asignatura\/[a-z0-9-]+$/.test(path))main.innerHTML=coursePage(path.split('/')[2]);
  else if(/^\/tema\/\d+\/estudio$/.test(path))main.innerHTML=temaPage(Number(path.split('/')[2]));
  else if(/^\/tema\/\d+$/.test(path))main.innerHTML=topicPage(Number(path.split('/')[2]),params);
  else if(/^\/practica\/\d+\/\d+$/.test(path))main.innerHTML=practicePage(Number(path.split('/')[2]),Number(path.split('/')[3]));
  else if(path==='/simulacro')main.innerHTML=setup();
  else if(path==='/historial')main.innerHTML=historyPage();
  else if(path.startsWith('/resultado/'))main.innerHTML=resultsPage(path.split('/')[2]);
  else if(path==='/reglas')main.innerHTML=rulesPage();
  else main.innerHTML=notFound();
  document.title=(main.querySelector('h1')?.innerText.replace(/\s+/g,' ')||'Estudiar')+' · Bitácora Implantes';
  if(focus){main.style?.removeProperty('min-height');window.scrollTo(0,0);main.focus({preventScroll:true});}
  const target=params.get('apartado');if(wide&&target)scrollToSection(target,false);
  markCurrentSection();
}
function markCurrentSection(){
  const index=document.querySelector?.('.tema-index');if(!index)return;
  const sections=[...document.querySelectorAll('.tema-section[id^="apartado-"]')];if(!sections.length)return;
  const line=innerHeight*.3;let current=sections[0];
  for(const s of sections){if(s.getBoundingClientRect().top<=line)current=s;else break;}
  if(innerHeight+scrollY>=document.documentElement.scrollHeight-2)current=sections[sections.length-1];
  const id=current.id.slice(9);const link=index.querySelector(`a[data-section="${CSS.escape(id)}"]`);
  if(!link||link.getAttribute('aria-current'))return;
  index.querySelectorAll('a[aria-current]').forEach(a=>a.removeAttribute('aria-current'));link.setAttribute('aria-current','location');
  if(index.scrollHeight>index.clientHeight){const top=link.offsetTop-index.offsetTop,bottom=top+link.offsetHeight;if(top<index.scrollTop+40||bottom>index.scrollTop+index.clientHeight-40)index.scrollTo({top:top-index.clientHeight/3});}
}
let sectionFrame=0;
window.addEventListener('scroll',()=>{if(!sectionFrame)sectionFrame=requestAnimationFrame(()=>{sectionFrame=0;markCurrentSection();});},{passive:true});
function scrollToSection(id,smooth=true){
  const el=document.getElementById?.('apartado-'+id);if(!el)return;
  el.scrollIntoView({behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto',block:'start'});
  el.querySelector('h2')?.setAttribute('tabindex','-1');el.querySelector('h2')?.focus({preventScroll:true});
}
let dialogAction, dialogTrigger;
function ask(title,description,confirmLabel,action,cancelLabel='Seguir con el simulacro') {
  dialogTrigger=document.activeElement;dialogAction=action;
  $('#dialog-title').textContent=title;$('#dialog-description').textContent=description;
  $('#dialog-confirm').textContent=confirmLabel;$('#dialog-cancel').textContent=cancelLabel;
  $('#dialog').showModal();$('#dialog-cancel').focus();
}
$('#dialog-cancel').addEventListener('click',()=>$('#dialog').close());
$('#dialog-confirm').addEventListener('click',()=>{const action=dialogAction;$('#dialog').close();action?.();});
$('#dialog').addEventListener('close',()=>{if(dialogTrigger?.isConnected)dialogTrigger.focus();});
document.addEventListener('change',e=>{
  if(questionTransition)return;
  if(e.target.id==='simulation-course'){write('simulationCourse',e.target.value);return;}
  if(e.target.id==='auto-advance'){write('autoAdvance',e.target.checked);return;}
  if(e.target.name==='practice-answer'){
    const [, ,t,b]=currentRoute().path.split('/');const p=getPractice(Number(t),Number(b));
    if(!p||p.finishedAt)return;
    const id=p.ids[p.index],selected=e.target.value;
    const advance=autoAdvanceEnabled()&&!Object.hasOwn(p.answers,id)&&p.index<p.ids.length-1;
    p.answers[id]=selected;p.checked=p.checked.filter(x=>x!==id);
    if(advance)p.index++;
    savePractice(p);
    if(advance)transitionQuestion(1,()=>render(false),()=>focusCurrentQuestion('practice'));
    else {render(false);document.querySelector(`input[name="practice-answer"][value="${selected}"]`)?.focus({preventScroll:true});}
  }
  if(e.target.name==='answer') {
    const selected=e.target.value;
    let advance=false;
    if(updateSession(s=>{
      const id=s.ids[s.index];advance=autoAdvanceEnabled()&&!Object.hasOwn(s.answers,id)&&s.index<s.ids.length-1;
      s.answers[id]=selected;if(advance)s.index++;
    })) {
      if(advance)transitionQuestion(1,()=>renderExamSafely(),()=>focusCurrentQuestion('exam'));
      else {renderExamSafely();document.querySelector(`input[name="answer"][value="${selected}"]`)?.focus({preventScroll:true});}
    }
  }
});
function navigationContext() {
  const {path,params}=currentRoute();
  if(/^\/practica\/\d+\/\d+$/.test(path)) {
    const [, ,t,b]=path.split('/');const p=getPractice(Number(t),Number(b));
    return p&&(!p.finishedAt||params.get('repaso')==='1')?{kind:'practice',index:Math.min(p.index,practiceIds(p).length-1),total:practiceIds(p).length,practice:p}:null;
  }
  if(path==='/examen'&&activeSession())return {kind:'exam',index:session.index,total:session.ids.length};
  if(path.startsWith('/resultado/')) {
    const s=read('session:'+path.split('/')[2]);if(!isValidSession(s,questionMap)||!s.finishedAt)return null;
    const total=s.ids.filter(id=>reviewFilter==='all'||s.answers[id]!==questionMap.get(id).correct).length;
    return total?{kind:'review',index:Math.min(reviewPage,total-1),total}:null;
  }
  return null;
}
const QUESTION_MOTION={exit:180,enter:240};
let questionTransition=null;
function cancelQuestionTransition() {
  const tx=questionTransition;if(!tx)return;
  questionTransition=null;tx.cancelled=true;tx.animation?.cancel();main.inert=false;
}
function focusCurrentQuestion(kind) {
  const question=$('.exam-question,.study-question h2');question?.setAttribute('tabindex','-1');question?.focus({preventScroll:true});
}
function retainQuestionScroll(commit,position={x:window.scrollX||0,y:window.scrollY||0}) {
  const {x,y}=position;
  // Keep enough document height when the next question is shorter, otherwise
  // the browser clamps the scroll before we can restore the previous position.
  if(y>0)main.style.minHeight=`max(calc(100dvh - 61px), ${Math.ceil(y+window.innerHeight-main.offsetTop)}px)`;
  else main.style?.removeProperty('min-height');
  commit();window.scrollTo(x,y);
}
function transitionQuestion(direction,commit,after) {
  if(questionTransition)return false;
  const outgoing=$('.question-panel,.study-question');
  if(!outgoing?.animate||matchMedia('(prefers-reduced-motion: reduce)').matches){retainQuestionScroll(commit);after?.();return true;}
  const tx={hash:location.hash,cancelled:false,animation:null,scroll:{x:window.scrollX||0,y:window.scrollY||0}};
  const offset=Math.min(outgoing.clientWidth*.65,260);
  questionTransition=tx;main.inert=true;
  (async()=>{
    try {
      tx.animation=outgoing.animate([
        {transform:getComputedStyle(outgoing).transform,opacity:1},
        {transform:`translateX(${-direction*offset}px)`,opacity:0}
      ],{duration:QUESTION_MOTION.exit,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
      await tx.animation.finished;
      if(tx.cancelled||location.hash!==tx.hash)return;
      // Release the outgoing animation before rendering so route-level cancellation
      // cannot cancel this intentional commit. Answers have already been saved.
      questionTransition=null;main.inert=false;retainQuestionScroll(commit,tx.scroll);
      if(tx.cancelled||location.hash!==tx.hash)return;
      const incoming=$('.question-panel,.study-question');if(!incoming)return;
      questionTransition=tx;main.inert=true;
      tx.animation=incoming.animate([
        {transform:`translateX(${direction*offset}px)`,opacity:0},
        {transform:'translateX(0)',opacity:1}
      ],{duration:QUESTION_MOTION.enter,easing:'cubic-bezier(.16,1,.3,1)'});
      await tx.animation.finished;
    } catch { /* A route change or expired exam may cancel the animation. */ }
    finally {
      if(questionTransition===tx){questionTransition=null;main.inert=false;if(!tx.cancelled&&location.hash===tx.hash)after?.();}
    }
  })();
  return true;
}
function navigateQuestion(value,absolute=false) {
  const ctx=navigationContext();if(!ctx||$('#dialog').open||questionTransition)return false;
  const next=Math.max(0,Math.min(ctx.total-1,absolute?value:ctx.index+value));if(next===ctx.index)return false;
  if(ctx.kind==='practice'){ctx.practice.index=next;savePractice(ctx.practice);}
  if(ctx.kind==='exam'&&!updateSession(s=>{s.index=next;}))return false;
  if(ctx.kind==='review')reviewPage=next;
  return transitionQuestion(Math.sign(next-ctx.index),()=>{if(ctx.kind==='exam')renderExamSafely();else render(false);},()=>focusCurrentQuestion(ctx.kind));
}
let drag=null,suppressClickUntil=0;
document.addEventListener('pointerdown',()=>{suppressClickUntil=0;},true);
function resetDrag() {
  if(drag?.panel){drag.panel.style.removeProperty('transform');drag.panel.classList.remove('swiping');}
  drag=null;
}
main.addEventListener('pointerdown',e=>{
  resetDrag();if(questionTransition||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0)||!navigationContext()||$('#dialog').open)return;
  if(e.target.closest('button,a,summary,.number-navigation,.question-navigator,.segmented,.actions,table'))return;
  // Leave the screen edge available for the browser's own back gesture.
  if(e.clientX<20||e.clientX>innerWidth-20)return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,horizontal:false,ctx:navigationContext(),panel:main.querySelector('.question-panel,.study-question')};
},{passive:true});
main.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.horizontal){
    if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*1.3){resetDrag();return;}
    if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.25)return;
    drag.horizontal=true;try{main.setPointerCapture(e.pointerId);}catch{}drag.panel?.classList.add('swiping');
  }
  e.preventDefault();
  if(drag.panel)drag.panel.style.transform=`translateX(${Math.max(-35,Math.min(35,dx*.18))}px)`;
},{passive:false});
main.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const current=navigationContext();
  const same=current&&current.kind===drag.ctx.kind&&current.index===drag.ctx.index;
  const direction=drag.horizontal&&same?swipeDirection(e.clientX-drag.x,e.clientY-drag.y):0;
  if(drag.horizontal){e.preventDefault();suppressClickUntil=performance.now()+400;}
  resetDrag();if(main.hasPointerCapture(e.pointerId))main.releasePointerCapture(e.pointerId);
  if(direction)navigateQuestion(direction);
},{passive:false});
main.addEventListener('pointercancel',resetDrag);
main.addEventListener('lostpointercapture',e=>{
  // Touch starts with implicit capture on the touched child. Moving capture to
  // main releases that child and bubbles this event: it must not cancel the drag.
  if(e.target===main&&drag?.id===e.pointerId&&!main.hasPointerCapture(e.pointerId))resetDrag();
});
document.addEventListener('click',e=>{if(performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,button,a,select,textarea,summary,[contenteditable="true"]'))return;
  const direction=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;
  if(direction&&navigateQuestion(direction))e.preventDefault();
});
function renderExamSafely(){clearInterval(timer);renderExam();}
document.addEventListener('click',e=>{
  if(e.target.closest('.skip')){e.preventDefault();main.focus();return;}
  const sectionLink=e.target.closest('.tema-index a[data-section]');
  if(sectionLink){e.preventDefault();history.replaceState(null,'',sectionLink.getAttribute('href'));scrollToSection(sectionLink.dataset.section);if(matchMedia('(max-width: 1023px)').matches)sectionLink.closest('details')?.removeAttribute('open');return;}
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  const a=button.dataset.action;
  if(a.startsWith('practice-')){
    const parts=currentRoute().path.split('/');const t=Number(button.dataset.topic||parts[2]),b=Number(button.dataset.block||parts[3]);const p=getPractice(t,b);if(!p)return;
    if(a==='practice-check'){if(p.finishedAt)return;const id=p.ids[p.index];if(!p.answers[id])return;p.checked=[...new Set([...p.checked,id])];const seen=seenIds();seen.add(id);write('seen',[...seen]);savePractice(p);render(false);}
      if(a==='practice-finish'){if(p.finishedAt){location.hash=`/practica/${t}/${b}`;return;}ask('¿Terminar este test?',`Quedan ${p.ids.length-Object.keys(p.answers).length} preguntas en blanco. Tus respuestas y el resultado se guardarán.`, 'Terminar test',()=>{p.finishedAt=Date.now();p.checked=[...p.ids];savePractice(p);render();},'Seguir con el test');}
    if(a==='practice-errors'){p.checked=[...p.ids];p.index=0;savePractice(p);location.hash=`/practica/${t}/${b}?repaso=1&filtro=errores`;}
    if(a==='practice-review'){p.checked=[...p.ids];p.index=0;savePractice(p);location.hash=`/practica/${t}/${b}?repaso=1`;}
    if(a==='practice-reset'){ask('¿Repetir el test?',`Se borrarán las respuestas guardadas de ${blockLabel(b).toLowerCase()} de este tema.`, 'Repetir test',()=>{p.answers={};p.checked=[];p.index=0;p.finishedAt=null;savePractice(p);render();},'Cancelar');}
  }
  if(a==='start'){
    if(activeSession())ask('¿Empezar otro simulacro?','El simulacro actual se corregirá con las respuestas guardadas y quedará en tu bitácora. Después empezará uno nuevo de 45 minutos de práctica.','Entregar y empezar otro',()=>{finish(false);startExam();},'Continuar el actual');
    else startExam();
  }
  if(a==='submit'){
    const s=activeSession();if(!s)return;
    ask('¿Entregar el simulacro?',`Tienes ${s.ids.length-Object.keys(s.answers).length} preguntas en blanco. Al entregar se cerrarán las respuestas y podrás ver la corrección.`,'Entregar simulacro',()=>finish(false));
  }
  if(a==='question-step')navigateQuestion(Number(button.dataset.direction));
  if(a==='jump'||a==='question-jump')navigateQuestion(Number(button.dataset.index),true);
  if(a==='flag'){
    if(updateSession(s=>{const id=s.ids[s.index];s.flags=s.flags.includes(id)?s.flags.filter(x=>x!==id):[...s.flags,id];})){renderExamSafely();$('[data-action="flag"]').focus({preventScroll:true});}
  }
  if(a==='clear-answer'){
    if(updateSession(s=>{delete s.answers[s.ids[s.index]];})){renderExamSafely();$('.answer-option input')?.focus({preventScroll:true});}
  }
  if(a==='review-filter'){reviewPage=0;reviewFilter=button.dataset.filter;const y=window.scrollY;render(false);window.scrollTo(0,y);$(`[data-filter="${reviewFilter}"]`)?.focus({preventScroll:true});}
  if(a==='reload')location.reload();
  if(a==='tema-retry'){temaCache.delete(Number(button.dataset.topic));render();}
});
window.addEventListener('hashchange',()=>render());
window.addEventListener('storage',e=>{const path=currentRoute().path;if(e.key?.startsWith(PREFIX)&&(path.startsWith('/practica/')||(e.key===PREFIX+'autoAdvance'&&path==='/examen')))render(false);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentRoute().path==='/examen')render(false);});
async function init() {
  try {
    const response=await fetch('bank.json?v=3',{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    validateBank(data);
    try{const idx=await fetch(`temas/index.json?v=${encodeURIComponent(data.version)}`,{signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():null);if(Array.isArray(idx?.temas))temaIndex=new Map(idx.temas.filter(t=>Number.isInteger(t.topic)).map(t=>[t.topic,t]));}catch{temaIndex=new Map();}
    bank=data;questionMap=new Map(bank.questions.map(q=>[q.id,q]));practiceMap=new Map(bank.topics.map(t=>[t.id,practiceBlocks(bank.questions,t.id)]));
    const saved=activeSession();if(saved&&remaining(saved.deadline)===0){finish(true);return;}
    render(false);
  } catch {
    document.title='No se pudieron cargar las preguntas · Bitácora Implantes';
    main.innerHTML='<div class="empty-state"><h1>No se han podido cargar las preguntas.</h1><p>Comprueba tu conexión y vuelve a intentarlo. Tu progreso guardado sigue en este navegador.</p><button class="btn" data-action="reload">Volver a cargar</button></div>';
  }
}
init();
