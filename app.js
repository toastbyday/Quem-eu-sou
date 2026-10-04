const $ = selector => document.querySelector(selector);
const app = $('#app');
// A prévia local chama a função pública diretamente; no Vercel usa a API da mesma origem.
const localPreview = ['localhost','127.0.0.1','terminal.local'].includes(location.hostname);
const apiUrl = localPreview ? 'https://fezriztbwnxcvkwrbybc.supabase.co/functions/v1/quem-eu-sou' : '/api/game';
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const storage = {
  get(key) { try { return localStorage.getItem(`qes:${key}`); } catch { return null; } },
  set(key, value) { try { value == null ? localStorage.removeItem(`qes:${key}`) : localStorage.setItem(`qes:${key}`, value); } catch { /* A sessão continua, mesmo sem armazenamento. */ } },
};
let token = storage.get('token');
if (!/^[0-9a-f]{64}$/.test(token || '')) {
  token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2,'0')).join('');
  storage.set('token', token);
}
let nick = storage.get('nick') || '';
let profilePhoto = storage.get('avatar') || '';
let pendingPhoto = '';
let photoLoading = false;
let room = null;
let busy = false;
let polling = false;
let admitted = false;
let lostConnection = false;
let toastTimer;
let lastHash = '';
let confirmResolve;
let lastAutoAttempt = 0;
let activeRooms = [];
let roomsLoaded = false;
let roomsError = '';
let listing = false;

function roomList() {
  if (roomsError) return `<div class="rooms-message">${escape(roomsError)}</div>`;
  if (!roomsLoaded) return '<div class="rooms-message">Buscando salas ativas…</div>';
  if (!activeRooms.length) return '<div class="rooms-message">Nenhuma sala ativa agora. Crie uma e chame a galera!</div>';
  return activeRooms.map(r => {
    const inRound = ['choosing','playing'].includes(r.phase);
    const blocked = inRound || r.players >= 12;
    const status = inRound ? 'Rodada em andamento' : r.players >= 12 ? 'Sala lotada' : 'Disponível para entrar';
    return `<article class="room-list-item"><div><strong>Sala de ${escape(r.host)}</strong><span>${r.players}/12 jogadores</span><small>${status}</small></div><button class="button ${blocked ? 'secondary' : 'primary'}" data-action="join" data-code="${escape(r.code)}" data-disabled="${blocked}" ${blocked ? 'disabled' : ''}>Entrar</button></article>`;
  }).join('');
}

async function refreshRooms() {
  if (!admitted || room || listing || busy || document.hidden) return;
  listing = true;
  try { const data = await api('list'); activeRooms = data.rooms; roomsLoaded = true; roomsError = ''; }
  catch { roomsError = 'Não foi possível buscar as salas. Tentaremos novamente em instantes.'; }
  finally {
    listing = false;
    if (!room && $('#active-rooms')) { $('#active-rooms').innerHTML = roomList(); bind(); setBusy(busy); }
  }
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}

async function api(action, extra = {}) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ action, token, code: room?.code || '', version: room?.version, round: room?.round, ...(['create','join'].includes(action) ? { avatar: profilePhoto } : {}), ...extra }),
    signal: AbortSignal.timeout(18000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Não foi possível conectar ao jogo.'); }
  if (!response.ok || data.error) throw new Error(data.error || 'Não foi possível atualizar a sala.');
  return data;
}

function update(data) {
  if (data.left) { room = null; storage.set('room', null); lastHash = ''; render(); return; }
  if (room && room.code === data.code && data.version < room.version) return;
  room = data;
  storage.set('room', room.code);
  const hash = JSON.stringify(data);
  if (hash !== lastHash || lostConnection) { lostConnection = false; lastHash = hash; render(); }
}

function setBusy(value) {
  busy = value;
  app.querySelectorAll('button[data-action],form button').forEach(button => {
    button.disabled = value || button.dataset.disabled === 'true';
  });
}

async function act(action, extra = {}) {
  if (busy) return;
  setBusy(true);
  try { update(await api(action, extra)); }
  catch (error) {
    toast(error.message);
    if (room) await poll();
  } finally { setBusy(false); }
}

async function poll() {
  if (!room || polling || !admitted || document.hidden) return;
  polling = true;
  const requestedCode = room.code;
  try {
    const result = await api('state');
    if (room?.code === requestedCode) update(result);
  } catch (error) {
    if (room?.code !== requestedCode) return;
    if (/expulso|não faz parte|não encontrada|encerrada/.test(error.message)) {
      room = null; storage.set('room', null); lastHash = ''; render(); toast(error.message);
    } else if (!/instante/.test(error.message)) {
      lostConnection = true;
      if (!$('#connection-warning')) {
        const warning = document.createElement('div');
        warning.id = 'connection-warning'; warning.className = 'connection';
        warning.textContent = 'Tentando reconectar… Sua partida fica salva. Aguarde antes de jogar sua vez.';
        app.prepend(warning);
      }
    }
  } finally { polling = false; }
}

function confirmAction(title, copy, label = 'Confirmar') {
  $('#confirm-title').textContent = title;
  $('#confirm-copy').textContent = copy;
  $('#accept-confirm').textContent = label;
  $('#confirm-dialog').showModal();
  return new Promise(resolve => { confirmResolve = resolve; });
}
function resolveConfirmation(value) {
  $('#confirm-dialog').close();
  confirmResolve?.(value); confirmResolve = null;
}
$('#cancel-confirm').onclick = () => resolveConfirmation(false);
$('#accept-confirm').onclick = () => resolveConfirmation(true);
$('#confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); resolveConfirmation(false); });

function avatar(player, index = 0, extra = '') {
  return `<span class="avatar a${index % 4} ${extra}" aria-hidden="true">${escape([...player.nick].slice(0,2).join('').toLocaleUpperCase('pt-BR'))}${player.avatar ? `<img src="${escape(player.avatar)}" alt="">` : ''}</span>`;
}

function home() {
  return `<div class="start-layout">
    <section class="intro"><span class="eyebrow">A GALERA SABE. VOCÊ NÃO.</span>
      <h1><span>Quem</span> <span>eu sou<span class="lime">?</span></span></h1>
      <p>Uma identidade secreta para cada amigo. Entre na call, faça suas perguntas e descubra a sua.</p>
      <div class="meta-tags"><span class="tag">2–12 jogadores</span><span class="tag">Online com amigos</span><span class="tag">No celular ou PC</span></div>
    </section>
    <section class="start-actions" aria-label="Escolha como jogar">
      <article class="action-card featured"><div class="card-top"><span class="card-icon" aria-hidden="true">+</span><span class="card-step">VOCÊ CHAMA A GALERA</span></div>
        <h3>Crie sua sala</h3><p>Seu grupo, suas identidades. Chame seus amigos pela lista de salas e comece a brincadeira.</p>
        <button class="button dark" data-action="create">Criar sala</button>
      </article>
      <article class="action-card"><div class="card-top"><span class="card-icon" aria-hidden="true">#</span><span class="card-step">ENCONTRE A GALERA</span></div>
        <h3>Salas ativas</h3><p>Escolha uma sala e entre para jogar. A lista se atualiza automaticamente.</p>
        <div id="active-rooms" class="active-rooms" aria-label="Salas ativas">${roomList()}</div>
      </article>
    </section>
  </div>`;
}

function sidebar() {
  const phase = room.phase;
  const current = phase === 'lobby' ? 0 : phase === 'choosing' ? 1 : 2;
  const steps = [['Junte seus amigos','Encontre a sala na lista de salas ativas.'],['Escolha um nome','Seu sorteio é secreto. Capriche na ideia.'],['Descubra quem é','Pergunte na call, uma vez por turno.']];
  return `<aside class="sidebar"><h3>O roteiro da brincadeira</h3><div class="steps">${steps.map(([title,copy],i) => `<div class="step ${i === current ? 'active' : ''}"><span class="step-number">0${i+1}</span><div><strong>${title}</strong><p>${copy}</p></div></div>`).join('')}</div><div class="sidebar-bottom"><strong>Todo mundo sabe, menos você.</strong><br>Durante a rodada, sua identidade fica secreta. No final, todos os nomes são revelados.</div></aside>`;
}

function playerCard(player, index, reveal = false) {
  const self = player.id === room.me;
  const host = room.host === room.me;
  const hideIdentity = self && room.phase !== 'finished';
  const status = player.status;
  let label = !player.online ? 'Reconectando…' : 'Na sala';
  if (reveal) label = status === 'guessed' ? '✓ Acertou!' : status === 'gaveup' ? 'Desistiu' : status === 'waiting' ? 'Joga na próxima rodada' : room.turn === player.id ? 'É a vez de perguntar' : 'Aguardando a vez';
  return `<article class="player-card ${reveal && room.turn === player.id ? 'turn' : ''} ${reveal ? escape(status) : ''}">
    <div class="player-header">${avatar(player,index)}<div><div class="player-nick">${escape(player.nick)}${self ? ' <span class="lime">(você)</span>' : ''}</div><div class="player-sub">${player.id === room.host ? 'Anfitrião' : 'Jogador'}${!player.online ? ' · offline' : ''}</div></div>
      ${host && !self ? `<button class="kick-button" data-action="kick" data-target="${escape(player.id)}" aria-label="Expulsar ${escape(player.nick)}" title="Expulsar jogador">×</button>` : ''}
    </div>
    ${reveal ? `<div class="identity ${hideIdentity ? 'hidden' : ''}">${hideIdentity ? '? ? ?' : escape(player.identity || 'Próxima rodada')}</div>` : ''}
    <div class="card-status">${self && reveal && status === 'active' ? `${label} · sua identidade é secreta` : label}</div>
  </article>`;
}

function lobby() {
  const host = room.host === room.me;
  const canStart = room.players.length >= 2;
  return `<section class="main-panel"><div class="panel-head"><h3>Sala de espera</h3><span class="count-pill">${room.players.length} / 12 jogadores</span></div>
    <div class="lobby-message"><span class="eyebrow">TODO MUNDO PRONTO?</span><h3>Uma boa call começa aqui.</h3><p>Convide seus amigos para entrar na sua sala pela lista de salas ativas. ${host ? 'Quando a galera entrar, você começa.' : 'O anfitrião inicia quando a galera chegar.'}</p></div>
    <div class="player-grid">${room.players.map((p,i) => playerCard(p,i)).join('')}</div>
    <div class="panel-actions">${host ? `<button class="button primary" data-action="start" data-disabled="${!canStart}" ${!canStart ? 'disabled' : ''}>${canStart ? 'Começar a rodada' : 'Aguardando mais um jogador'}</button>` : '<div class="wait-label">Aguardando o anfitrião começar…</div>'}</div>
  </section>`;
}

function choosing() {
  const assigned = room.players.find(p => p.id === room.assignment);
  const readyCount = room.players.filter(p => p.ready).length;
  return `<section class="main-panel"><div class="panel-head"><h3>Hora do segredo</h3><span class="count-pill">${readyCount} / ${room.players.length} escolhas</span></div>
    <div class="assignment-panel">${avatar(assigned || {nick:'?'},room.players.indexOf(assigned),'assignment-avatar')}
      <span class="eyebrow">${room.submitted ? 'SEU SEGREDO ESTÁ GUARDADO' : 'VOCÊ ESCOLHE A IDENTIDADE DE'}</span>
      <h3>${escape(assigned?.nick || 'Seu amigo')}</h3>
      ${room.submitted ? '<p>Agora é só esperar a galera escolher. A rodada começa assim que todos enviarem.</p><div class="notice">✓ Nome enviado. Não conte para quem você escolheu!</div>' : `<p>Pode ser uma pessoa, personagem, animal ou objeto. Use a criatividade e não conte para ${escape(assigned?.nick)}.</p>
        <form id="assign-form"><label for="identity-input">Qual será o nome secreto?</label><input id="identity-input" name="identity" minlength="2" maxlength="60" placeholder="Ex.: Bob Esponja" autocomplete="off" required><button class="button primary" type="submit">Guardar o nome</button></form>`}
    </div><div class="ready-list">${room.players.map(p => {
      // Pronto significa que o jogador recebeu seu nome. Não revela quem o escolheu.
      return `<span class="ready-chip ${p.ready ? 'done' : ''}">${p.ready ? '✓' : '…'} ${escape(p.nick)}</span>`;
    }).join('')}</div>
    <p class="wait-label">${readyCount} de ${room.players.length} identidades guardadas.</p>
  </section>`;
}

function playing() {
  const current = room.players.find(p => p.id === room.turn);
  const me = room.players.find(p => p.id === room.me);
  const myTurn = room.turn === room.me;
  const active = me?.status === 'active';
  return `<section class="main-panel"><div class="turn-banner">${avatar(current || { nick:'?' },room.players.indexOf(current))}<div><span class="eyebrow">AGORA É A VEZ DE</span><h3>${myTurn ? 'Você perguntar!' : escape(current?.nick || 'Aguardando')}</h3></div>${myTurn ? '<span class="tag">SUA VEZ</span>' : ''}</div>
    <div class="call-strip"><span aria-hidden="true">◉</span><span>${myTurn ? '<strong>Faça sua pergunta na call.</strong> Depois das respostas, toque em Pronto.' : `<strong>${escape(current?.nick || 'Seu amigo')} pergunta na call.</strong> Respondam sem entregar o segredo.`}</span></div>
    <div class="player-grid">${room.players.map((p,i) => playerCard(p,i,true)).join('')}</div>
    <div class="turn-controls">${active ? (myTurn ? `<button class="button primary" data-action="ready">Pronto · passar a vez</button><div class="button-row"><button class="button success" data-action="guessed">✓ Acertei!</button><button class="button danger" data-action="giveup">Desistir</button></div>` : `<p class="wait-label">Aguarde sua vez. Observe os nomes e ajude a galera.</p><button class="button danger" data-action="giveup">Desistir da rodada</button>`) : `<div class="wait-label">${me?.status === 'guessed' ? '✓ Você acertou! Agora ajude seus amigos na call.' : 'Você saiu dos turnos desta rodada. Continue acompanhando a galera.'}</div>`}</div>
  </section>`;
}

function finished() {
  const count = room.players.filter(p => p.status === 'guessed').length;
  const host = room.host === room.me;
  return `<section class="main-panel"><div class="panel-head"><span class="eyebrow">RODADA ${room.round} CONCLUÍDA</span><span class="count-pill">${count} acerto${count !== 1 ? 's' : ''}</span></div>
    <h3 class="finish-title">Os nomes da rodada.</h3><p class="finish-copy">${room.players.length >= 2 ? 'Novos nomes, outro sorteio. A próxima rodada começa em <strong id="countdown">10</strong>s.' : 'Convide mais um amigo para começar a próxima rodada.'}</p>
    <div class="player-grid">${room.players.map((p,i) => playerCard(p,i,true)).join('')}</div>
    ${host && room.players.length >= 2 ? '<div class="panel-actions"><button class="button primary" data-action="start">Começar a próxima agora</button></div>' : ''}
  </section>`;
}

function render() {
  const focused = document.activeElement;
  const values = [...app.querySelectorAll('input')].map(input => ({ id: input.id, value: input.value, focus: input === focused, start: input.selectionStart, end: input.selectionEnd }));
  if (!room) app.innerHTML = home();
  else {
    const title = room.phase === 'lobby' ? 'A galera reunida.' : `Rodada ${room.round}<span class="lime">.</span>`;
    app.innerHTML = `${lostConnection ? '<div class="connection" id="connection-warning">Tentando reconectar… Aguarde antes de jogar sua vez.</div>' : ''}<div class="room-top"><div class="room-title"><span class="eyebrow">${room.phase === 'lobby' ? 'SUA SALA' : 'QUEM EU SOU?'}</span><h2>${title}</h2></div><div class="room-tools"><button class="button secondary" data-action="leave">Sair</button></div></div>
      <div class="room-layout">${({ lobby, choosing, playing, finished }[room.phase] || lobby)()}${sidebar()}</div>`;
  }
  values.forEach(saved => {
    const input = document.getElementById(saved.id);
    if (!input) return;
    input.value = saved.value;
    if (saved.focus) { input.focus({ preventScroll:true }); try { input.setSelectionRange(saved.start, saved.end); } catch {} }
  });
  bind(); setBusy(busy); tick();
}

function bind() {
  app.querySelectorAll('[data-action]').forEach(button => button.onclick = async () => {
    const action = button.dataset.action;
    if (!admitted || busy) return;
    if (action === 'kick') {
      const player = room.players.find(p => p.id === button.dataset.target);
      if (!await confirmAction('Expulsar jogador?', `${player?.nick} terá que deixar esta sala.`, 'Expulsar')) return;
    }
    if (action === 'leave' && !await confirmAction('Sair da sala?', 'Você pode voltar pela lista de salas. Se uma rodada estiver em andamento, aguarde ela terminar para entrar novamente.', 'Sair')) return;
    if (action === 'guessed' && !await confirmAction('Você acertou?', 'Confirme seu palpite com a galera na call antes de marcar o acerto. Seu acerto será marcado e você sairá dos turnos.', 'Sim, acertei!')) return;
    if (action === 'giveup' && !await confirmAction('Desistir desta rodada?', 'Você poderá acompanhar seus amigos e voltará a jogar na próxima rodada.', 'Desistir')) return;
    await act(action, action === 'create' ? { nick } : action === 'join' ? { code: button.dataset.code, nick } : action === 'kick' ? { target: button.dataset.target } : {});
    if (!room) refreshRooms();
  });
  if ($('#assign-form')) $('#assign-form').onsubmit = async event => {
    event.preventDefault();
    await act('assign', { identity: $('#identity-input').value.trim() });
  };

}

function tick() {
  if (room?.phase !== 'finished' || !room.finished_at || room.players.length < 2) return;
  const seconds = Math.max(0, Math.ceil((Date.parse(room.finished_at) + 10000 - Date.now()) / 1000));
  if ($('#countdown')) $('#countdown').textContent = seconds;
  if (seconds === 0 && admitted && !busy && !lostConnection && !document.hidden && Date.now() - lastAutoAttempt > 3000) {
    lastAutoAttempt = Date.now();
    // Servidor permite iniciar automaticamente após o intervalo, com versão validada.
    act('start');
  }
}

$('#help-button').onclick = () => $('#help-dialog').showModal();
$('#close-help').onclick = () => $('#help-dialog').close();
$('#nick-dialog').addEventListener('cancel', event => event.preventDefault());
$('#nick-input').value = nick;
$('#nick-form').onsubmit = async event => {
  event.preventDefault();
  const name = $('#nick-input').value.trim();
  if ([...name].length < 2) { toast('Seu nick precisa ter pelo menos 2 letras.'); return; }
  nick = name; storage.set('nick', nick); admitted = true;
  $('#nick-label').textContent = nick;
  refreshProfile();
  $('#nick-dialog').close();
  const code = storage.get('room');
  if (/^[A-F0-9]{6}$/.test(code || '')) {
    setBusy(true);
    try { update(await api('state', { code })); toast('Você voltou para a sala.'); }
    catch { storage.set('room', null); toast('Sua sala anterior foi encerrada. Crie ou entre em outra.'); }
    finally { setBusy(false); }
  }
  refreshRooms();
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); refreshRooms(); } });
window.addEventListener('online', poll);
setInterval(() => { if (!busy) poll(); }, 1800);
setInterval(tick, 1000);
setInterval(refreshRooms, 5000);
render();
$('#nick-dialog').showModal();

function refreshProfile() {
  $('#profile-button').innerHTML = avatar({ nick: nick || 'EU', avatar: profilePhoto });
  $('#profile-preview').innerHTML = avatar({ nick: nick || 'EU', avatar: pendingPhoto });
}
$('#profile-button').onclick = () => {
  pendingPhoto = profilePhoto;
  $('#profile-file').value = '';
  $('#profile-message').textContent = 'JPG, PNG ou WebP · até 8 MB.';
  refreshProfile();
  $('#profile-dialog').showModal();
};
$('#close-profile').onclick = () => $('#profile-dialog').close();
$('#remove-profile').onclick = () => { pendingPhoto = ''; $('#profile-file').value = ''; refreshProfile(); };
$('#profile-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { toast('Escolha JPG, PNG ou WebP de até 8 MB.'); return; }
  photoLoading = true;
  $('#save-profile').disabled = true;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    canvas.getContext('2d').drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, 96, 96);
    pendingPhoto = canvas.toDataURL('image/jpeg', .72);
    if (pendingPhoto.length > 18000) throw new Error('Não foi possível reduzir a foto. Escolha outra imagem.');
    refreshProfile(); $('#profile-message').textContent = 'Foto pronta. Clique em Salvar foto.';
  } catch (error) { pendingPhoto = profilePhoto; refreshProfile(); toast(error.message || 'Não foi possível abrir a imagem.'); }
  finally { URL.revokeObjectURL(url); photoLoading = false; $('#save-profile').disabled = false; }
};
$('#profile-form').onsubmit = async event => {
  event.preventDefault();
  if (photoLoading || busy) return;
  const selectedPhoto = pendingPhoto;
  setBusy(true); $('#save-profile').disabled = true;
  try {
    if (room) update(await api('profile', { avatar: selectedPhoto }));
    profilePhoto = selectedPhoto; storage.set('avatar', profilePhoto); refreshProfile();
    $('#profile-dialog').close(); toast('Foto de perfil salva.');
  } catch (error) { toast(error.message); }
  finally { setBusy(false); $('#save-profile').disabled = false; }
};
refreshProfile();
