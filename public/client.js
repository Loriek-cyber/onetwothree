const socket = io();

let myId = null;

const nameInput = document.getElementById('name');
const joinBtn = document.getElementById('joinBtn');
const startBtn = document.getElementById('startBtn');
const readyChk = document.getElementById('readyChk');
const playBtn = document.getElementById('playBtn');
const slapBtn = document.getElementById('slapBtn');
const playersDiv = document.getElementById('players');
const centerTop = document.getElementById('centerTop');
const centerCount = document.getElementById('centerCount');
const messages = document.getElementById('messages');
const fsBtn = document.getElementById('fsBtn');
const app = document.getElementById('app');

function log(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  messages.prepend(d);
}

joinBtn.onclick = ()=>{
  const n = nameInput.value.trim() || 'Giocatore';
  socket.emit('join', n);
}

startBtn.onclick = ()=> socket.emit('start');
readyChk.onchange = ()=> socket.emit('set-ready', !!readyChk.checked);
playBtn.onclick = ()=> socket.emit('play-card');
slapBtn.onclick = ()=> socket.emit('slap');

socket.on('joined', data => {
  myId = data.id;
  log('Sei dentro come ' + data.name);
  if (readyChk) readyChk.checked = false;
});

socket.on('state', s => {
  playersDiv.innerHTML = '';
  s.players.forEach((p, idx) => {
    const el = document.createElement('div');
    el.className = 'player';
    if (p.id === s.turnPlayerId) el.classList.add('active');
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = p.name[0] || '?';
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<div class="name">${p.name} ${s.lobbyHostId === p.id ? '<span class="host">(host)</span>' : ''}</div><div class="count">${p.handCount} carte ${p.ready? '· Ready':''}</div>`;
    el.appendChild(avatar);
    el.appendChild(info);
    playersDiv.appendChild(el);
  });
  centerCount.textContent = s.centerCount;
  // try to show image if exists in /cards; else fall back to text
  if (s.top) {
    // sanitize suit names to file-friendly tokens
    const suitMap = {'♠':'spades','♣':'clubs','♥':'hearts','♦':'diamonds'};
    const suitToken = suitMap[s.top.suit] || s.top.suit;
    const rankToken = s.top.rank;
    const fnameBase = `${rankToken}_${suitToken}`;

    function tryLoad(paths, idx = 0) {
      if (idx >= paths.length) {
        centerTop.textContent = '?';
        return;
      }
      const p = paths[idx];
      const img = document.createElement('img');
      img.className = 'card-img';
      img.src = p;
      img.alt = rankToken + s.top.suit;
      img.onload = ()=>{
        centerTop.innerHTML = '';
        centerTop.appendChild(img);
      };
      img.onerror = ()=> tryLoad(paths, idx+1);
    }

    const tries = [`/cards/${fnameBase}.png`, `/cards/${fnameBase}.svg`, '/cards/placeholder.svg'];
    tryLoad(tries);
  } else {
    centerTop.textContent = '?';
  }
});

socket.on('card-played', d=>{
  log(`${d.playerId} ha buttato ${d.card.rank}${d.card.suit}`);
  if (d.double) log('Doppia! Prendi il mazzo!');
  // small pulse animation for card slot
  const slot = document.querySelector('.card-slot');
  if (slot) {
    slot.animate([{transform:'scale(1)'},{transform:'scale(1.03)'},{transform:'scale(1)'}],{duration:220});
  }
});

socket.on('slap-win', d=>{
  log(`${d.playerId} ha vinto il mazzo (${d.wonCount} carte)`);
});

socket.on('invalid-slap', d=>{
  log(`${d.playerId} ha sbagliato lo slap! Penalità.`);
});

socket.on('penalty-applied', d=>{
  log(`${d.playerId} penalizzato per spam.`);
});

socket.on('game-over', d=>{
  log(`Partita finita. Vincitore: ${d.winnerId}`);
});

socket.on('error-msg', m=> log('Errore: '+m));

// keyboard: space to play, f to slap
document.addEventListener('keydown', e=>{
  if (e.code === 'Space') {
    e.preventDefault();
    socket.emit('play-card');
  }
  if (e.key.toLowerCase() === 'f') {
    socket.emit('slap');
  }
});

// simple touch: clicking the centerTop is a slap
centerTop.addEventListener('click', ()=> socket.emit('slap'));

// fullscreen toggle
fsBtn.addEventListener('click', ()=>{
  if (!document.fullscreenElement) {
    app.requestFullscreen().catch(err => console.error(err));
  } else {
    document.exitFullscreen();
  }
});

// Scale center card responsively
function resizeCard() {
  const cs = window.getComputedStyle(centerTop);
  // keep it proportional using CSS; nothing else needed here
}
window.addEventListener('resize', resizeCard);
resizeCard();
