/* Administrácia Ateliér Amulet. Obsah webu je v _data/*.json; uloženie = jeden commit cez backend webhunter-admin, web sa potom sám prebuduje (cca minúta). */
'use strict';
(() => {
const CFG = { id: 'sk-atelieramulet', repo: 'webhunter-navrhy/sk-atelieramulet', site: '../', api: 'https://webhunter-admin.webhunter.workers.dev' };
const SK = 'sk_atelieramulet_admin';
const FILES = { kurzy: '_data/kurzy.json', clanky: '_data/clanky.json', texty: '_data/texty.json', site: '_data/site.json' };
const S = { sess: null, D: {}, snap: {}, pending: {}, preview: {}, tab: 'kurzy', saving: false };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const uid = () => Math.random().toString(36).slice(2, 7);
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 4500); };
const b64e = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (s) => b64e(new TextEncoder().encode(s));

async function api(path, opt = {}) {
  const headers = typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {};
  if (S.sess) headers.Authorization = 'Bearer ' + S.sess;
  let r;
  try { r = await fetch(`${CFG.api}/api/${CFG.id}${path}`, { ...opt, headers, cache: 'no-store' }); } catch { throw new Error('Nepodarilo sa spojiť so serverom. Skontrolujte pripojenie.'); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
  return opt.raw ? r.text() : r.json();
}
const readFile = (p) => api('/file?path=' + encodeURIComponent(p) + '&t=' + Date.now(), { raw: true });
async function commit(files, message) {
  const out = [];
  for (const f of files) { const { sha } = await api('/blob', { method: 'POST', body: JSON.stringify({ content: f.b64 ?? utf8b64(f.content), encoding: 'base64' }) }); out.push({ path: f.path, sha }); }
  return (await api('/commit', { method: 'POST', body: JSON.stringify({ files: out, message }) })).sha;
}
const dirty = () => Object.keys(FILES).filter((k) => S.D[k] && JSON.stringify(S.D[k]) !== S.snap[k]);
const snap = (ks = Object.keys(FILES)) => ks.forEach((k) => (S.snap[k] = JSON.stringify(S.D[k])));
window.addEventListener('beforeunload', (e) => { if (dirty().length) { e.preventDefault(); e.returnValue = ''; } });

/* ---- prihlásenie */
function loginView(msg) {
  $('#app').innerHTML = `<form class="login card"><h2>Administrácia webu</h2><p>Ateliér Amulet</p><label for="pw">Heslo</label><input id="pw" type="password" autocomplete="current-password" required><div class="row"><button class="btn">Prihlásiť</button></div><p class="hint" id="err">${esc(msg || '')}</p></form>`;
  $('form').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) }); S.sess = r.token; localStorage.setItem(SK, JSON.stringify({ t: r.token, exp: Date.now() + 11 * 3600e3 })); start(); }
    catch (er) { $('#err').textContent = er.status === 401 ? 'Nesprávne heslo.' : er.message; }
  };
}

/* ---- polia */
const inp = (lbl, path, type = 'text') => `<label>${lbl}<input type="${type}" data-p="${path}" value="${esc(get(path))}"></label>`;
const area = (lbl, path, rows) => `<label>${lbl}<textarea data-p="${path}" ${rows ? `style="min-height:${rows}rem"` : ''}>${esc(get(path))}</textarea></label>`;
function get(path) { let o = S.D; for (const k of path.split('.')) { if (o == null) return ''; o = o[k]; } return Array.isArray(o) ? o.join('\n\n') : o; }
function set(path, v) {
  const ks = path.split('.'); let o = S.D; for (const k of ks.slice(0, -1)) o = o[k];
  const last = ks[ks.length - 1];
  if (Array.isArray(o[last])) o[last] = String(v).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean); else o[last] = v;
}
const imgSrc = (p) => S.preview['img/' + p] || CFG.site + 'img/' + p.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-') + '-640.webp';

/* ---- záložky */
const TABS = { kurzy: 'Kurzy', clanky: 'Články', texty: 'Texty a fotky', site: 'Kontakt' };
function view() {
  const tabs = Object.entries(TABS).map(([k, v]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('');
  let body = '';
  if (S.tab === 'kurzy') {
    body = `<p class="hint">Kurzy sa zobrazia na stránke Kurzy. Prázdne polia sa na webe nezobrazia. Skrytý kurz zostane uložený, ale nebude na webe.</p>` + S.D.kurzy.map((k, i) => `<div class="card"><b>${esc(k.nazov) || 'Nový kurz'}</b>
      ${inp('Názov', `kurzy.${i}.nazov`)}
      <label>Skupina<select data-p="kurzy.${i}.skupina">${[['kaligrafia', 'Kaligrafia'], ['kreslenie', 'Kreslenie a maľba'], ['pripravka', 'Príprava na talentové skúšky']].map(([v, t]) => `<option value="${v}" ${k.skupina === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${area('Popis', `kurzy.${i}.popis`)}
      ${inp('Termín', `kurzy.${i}.termin`)}${inp('Čas', `kurzy.${i}.cas`)}${inp('Cena', `kurzy.${i}.cena`)}${inp('Miesto', `kurzy.${i}.miesto`)}
      <label><input type="checkbox" data-c="kurzy.${i}.aktivny" ${k.aktivny ? 'checked' : ''}> Zobraziť na webe</label>
      <div class="row"><button class="btn sec" data-up="${i}">↑ Vyššie</button><button class="btn sec" data-dn="${i}">↓ Nižšie</button><button class="btn sec" data-dup="${i}">Kopírovať</button><button class="btn red" data-del="kurzy:${i}">Zmazať</button></div></div>`).join('') + `<div class="row"><button class="btn" id="add">+ Pridať kurz</button></div>`;
  } else if (S.tab === 'clanky') {
    body = `<p class="hint">Odseky oddeľte prázdnym riadkom.</p>` + S.D.clanky.map((c, i) => `<div class="card"><b>${esc(c.nazov) || 'Nový článok'}</b>${inp('Názov', `clanky.${i}.nazov`)}${inp('Dátum (RRRR-MM-DD)', `clanky.${i}.datum`)}${area('Text', `clanky.${i}.text`, 14)}
      <div class="row"><button class="btn sec" data-up="${i}">↑ Vyššie</button><button class="btn sec" data-dn="${i}">↓ Nižšie</button><button class="btn red" data-del="clanky:${i}">Zmazať</button></div></div>`).join('') + `<div class="row"><button class="btn" id="add">+ Pridať článok</button></div>`;
  } else if (S.tab === 'texty') {
    const T = S.D.texty;
    body = `<div class="card"><b>Úvod</b>${inp('Nadpis', 'texty.hero_nadpis')}${area('Text', 'texty.hero_text')}</div><div class="card"><b>O ateliéri</b>${area('Text (odseky oddeľte prázdnym riadkom)', 'texty.o_nas', 10)}</div>` +
      `<div class="card"><b>Tím</b>${T.tim.map((t, i) => `<div>${inp('Meno', `texty.tim.${i}.meno`)}${inp('Rola', `texty.tim.${i}.rola`)}<img class="thumb" alt="" src="${imgSrc(t.foto)}"><input type="file" accept="image/*" data-foto="texty.tim.${i}.foto"><hr></div>`).join('')}</div>` +
      `<div class="card"><b>Ponuka na úvodnej stránke</b>${T.ponuka.map((t, i) => `<div>${inp('Názov', `texty.ponuka.${i}.nazov`)}${area('Text', `texty.ponuka.${i}.text`)}<img class="thumb" alt="" src="${imgSrc(t.foto)}"><input type="file" accept="image/*" data-foto="texty.ponuka.${i}.foto"><hr></div>`).join('')}</div>`;
  } else {
    body = `<div class="card"><b>Kontakt</b>${inp('E-mail', 'site.kontakt.email', 'email')}${inp('Facebook', 'site.sameas.0')}${inp('Instagram', 'site.sameas.1')}${inp('YouTube', 'site.sameas.2')}</div>`;
  }
  $('#app').innerHTML = `<div class="top"><b>Ateliér Amulet – administrácia</b><span class="pub" id="pub">Web je aktuálny</span><a href="${CFG.site}" target="_blank" rel="noopener">Zobraziť web</a><button class="btn sec" id="out">Odhlásiť</button></div><div class="tabs">${tabs}</div><main>${body}</main><div class="savebar"><button class="btn" id="save" disabled>Uložiť zmeny</button><button class="btn sec" id="disc" disabled>Zahodiť zmeny</button></div>`;
  bar();
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; view(); }));
  document.querySelectorAll('[data-p]').forEach((el) => (el.oninput = el.onchange = () => { set(el.dataset.p, el.value); bar(); }));
  document.querySelectorAll('[data-c]').forEach((el) => (el.onchange = () => { set(el.dataset.c, el.checked); bar(); }));
  const lst = () => S.D[S.tab];
  const mv = (i, d) => { const a = lst(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; view(); };
  document.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => mv(+b.dataset.up, -1)));
  document.querySelectorAll('[data-dn]').forEach((b) => (b.onclick = () => mv(+b.dataset.dn, 1)));
  document.querySelectorAll('[data-dup]').forEach((b) => (b.onclick = () => { const a = lst(); const c = JSON.parse(JSON.stringify(a[+b.dataset.dup])); c.id = c.id + '-' + uid(); a.splice(+b.dataset.dup + 1, 0, c); view(); }));
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { if (confirm('Naozaj zmazať?')) { S.D[S.tab].splice(+b.dataset.del.split(':')[1], 1); view(); } }));
  const add = $('#add'); if (add) add.onclick = () => { S.D[S.tab].unshift(S.tab === 'kurzy' ? { id: 'kurz-' + uid(), nazov: 'Nový kurz', skupina: 'kaligrafia', popis: '', termin: '', cas: '', cena: '', miesto: '', aktivny: true } : { id: 'clanok-' + uid(), nazov: 'Nový článok', datum: new Date().toISOString().slice(0, 10), text: [] }); view(); };
  document.querySelectorAll('[data-foto]').forEach((el) => (el.onchange = async () => { try { await foto(el.dataset.foto, el.files[0]); view(); } catch (e) { toast(e.message); } }));
  $('#out').onclick = () => { localStorage.removeItem(SK); location.reload(); };
  $('#save').onclick = save; $('#disc').onclick = () => { dirty().forEach((k) => (S.D[k] = JSON.parse(S.snap[k]))); view(); toast('Zmeny zahodené.'); };
}
function bar() { const d = dirty().length > 0; const s = $('#save'), x = $('#disc'); if (s) { s.disabled = !d || S.saving; x.disabled = !d || S.saving; } }

/* ---- fotky */
async function foto(path, file) {
  if (!file) return;
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('Súbor sa nedá načítať. Použite fotku JPG, PNG alebo WebP.'); }
  const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  const d = new Date(); const name = `uploads/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${slug(file.name.replace(/\.[^.]+$/, '')).slice(0, 30) || 'foto'}-${uid()}.jpg`;
  S.pending['img/' + name] = b64e(await blob.arrayBuffer()); S.preview['img/' + name] = URL.createObjectURL(blob); set(path, name);
}

/* ---- uloženie */
async function save() {
  const ks = dirty(); if (!ks.length || S.saving) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(S.D.site.kontakt.email || '')) return toast('E-mail v Kontakte nevyzerá správne.');
  for (const k of S.D.kurzy) if (!String(k.nazov).trim()) return toast('Jeden kurz nemá názov.');
  for (const c of S.D.clanky) { if (!String(c.nazov).trim()) return toast('Jeden článok nemá názov.'); if (!c.id || /^clanok-/.test(c.id)) c.id = slug(c.nazov) || 'clanok-' + uid(); }
  for (const k of S.D.kurzy) if (!k.id || /^kurz-/.test(k.id)) k.id = slug(k.nazov) || 'kurz-' + uid();
  S.saving = true; bar();
  try {
    const files = dirty().map((k) => ({ path: FILES[k], content: JSON.stringify(S.D[k], null, 2) + '\n' }));
    const used = JSON.stringify(S.D); const imgs = Object.keys(S.pending).filter((p) => used.includes(p.slice(4)));
    imgs.forEach((p) => files.push({ path: p, b64: S.pending[p] }));
    const sha = await commit(files, 'Administrácia: ' + dirty().map((k) => TABS[k === 'site' ? 'site' : k] || k).join(', '));
    imgs.forEach((p) => delete S.pending[p]); snap(ks); toast('Uložené. Zmeny budú na webe približne o minútu.'); watch(sha);
  } catch (e) { if (e.status === 401) { localStorage.removeItem(SK); loginView('Prihlásenie vypršalo, zadajte heslo znova.'); } else toast('Uloženie sa nepodarilo: ' + e.message); }
  finally { S.saving = false; bar(); }
}
let timer;
function watch(sha) {
  clearInterval(timer); const p = $('#pub'); if (p) p.textContent = 'Zverejňujem zmeny…'; const t0 = Date.now();
  timer = setInterval(async () => {
    try { const v = await fetch(CFG.site + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()); if (v.sha === sha) { clearInterval(timer); const q = $('#pub'); if (q) q.textContent = 'Web je aktuálny'; toast('Zmeny sú na webe.'); } } catch {}
    if (Date.now() - t0 > 8 * 60000) { clearInterval(timer); const q = $('#pub'); if (q) q.textContent = 'Zverejnenie trvá dlhšie'; }
  }, 6000);
}
async function start() {
  $('#app').innerHTML = '<p style="padding:2rem">Načítavam…</p>';
  try { for (const k of Object.keys(FILES)) S.D[k] = JSON.parse(await readFile(FILES[k])); snap(); view(); }
  catch (e) { if (e.status === 401) { localStorage.removeItem(SK); loginView(); } else loginView('Chyba: ' + e.message); }
}
const ss = JSON.parse(localStorage.getItem(SK) || 'null');
if (ss && ss.exp > Date.now()) { S.sess = ss.t; start(); } else loginView();
})();
