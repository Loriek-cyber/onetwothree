const socket = io();

// State
let myId = null;
let myLobbyCode = null;

// DOM elements
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const createForm = document.getElementById('create-form');
const joinForm = document.getElementById('join-form');
const createName = document.getElementById('create-name');
const joinCode = document.getElementById('join-code');
const joinName = document.getElementById('join-name');
const waitingRoom = document.getElementById('waiting-room');
const lobbyCodeSpan = document.getElementById('lobby-code');
const waitingPlayers = document.getElementById('waiting-players');
const readyChk = document.getElementById('readyChk');
const startBtn = document.getElementById('startBtn');
const playersDiv = document.getElementById('players');
const centerTop = document.getElementById('centerTop');
const centerCount = document.getElementById('centerCount');
const messages = document.getElementById('messages');
const playBtn = document.getElementById('playBtn');
const slapBtn = document.getElementById('slapBtn');
const fsBtn = document.getElementById('fsBtn');

function log(msg, className='') {
  const d = document.createElement('div');
  d.textContent = msg;
  if (className) d.className = className;
  messages.prepend(d);
}

// Forms and button handlers
createForm.onsubmit = e => {
  e.preventDefault();
  const name = createName.value.trim();
  if (!name) return;
  socket.emit('create-lobby', name);
};

joinForm.onsubmit = e => {
  e.preventDefault();
  const code = joinCode.value.trim().toUpperCase();
  const name = joinName.value.trim();
  if (!code || !name) return;
  socket.emit('join-lobby', {code, name});
};

readyChk.onchange = () => {
  socket.emit('set-ready', readyChk.checked);
};

startBtn.onclick = () => {
  socket.emit('start');
};

playBtn.onclick = () => socket.emit('play-card');
slapBtn.onclick = () => socket.emit('slap');

// Keyboard controls
document.addEventListener('keydown', e => {
  if (!myId || !myLobbyCode) return;
  if (e.code === 'Space') {
    e.preventDefault();
    socket.emit('play-card');
  }
  if (e.code === 'KeyF') {
    e.preventDefault();
    socket.emit('slap');
  }
});

// Card loading helper
function tryLoadCard(rank, suit) {
  return new Promise((resolve) => {
    // sanitize suit names to file-friendly tokens
    const suitMap = {'♠':'spades','♣':'clubs','♥':'hearts','♦':'diamonds'};
    const suitToken = suitMap[suit] || suit;
    const rankToken = rank;
    const fnameBase = `${rankToken}_${suitToken}`;

    function tryLoad(paths, idx = 0) {
      if (idx >= paths.length) {
        centerTop.textContent = '?';
        resolve();
        return;
      }
      const p = paths[idx];
      const img = document.createElement('img');
      img.className = 'card-img';
      img.src = p;
      img.alt = rankToken + suit;
      img.onload = () => {
        centerTop.innerHTML = '';
        centerTop.appendChild(img);
        resolve();
      };
      img.onerror = () => tryLoad(paths, idx+1);
    }

    const tries = [`/cards/${fnameBase}.png`, `/cards/${fnameBase}.svg`, '/cards/placeholder.svg'];
    tryLoad(tries);
  });
}

// New function to update center pile UI with last and previous cards
function updateCenterPile(state) {
  const centerPileElement = document.getElementById('centerPile');
  if (!centerPileElement) return;
  centerPileElement.innerHTML = '';
  
  // Display the penultimate (previous) card if exists
  if (state.previous) {
    const prevCard = document.createElement('img');
    prevCard.src = '/cards/' + formatCardImage(state.previous);
    prevCard.classList.add('center-card', 'previous-card');
    // Add animation class for smooth fade-in
    prevCard.classList.add('fade-in');
    centerPileElement.appendChild(prevCard);
  }
  
  // Display the last (top) card if exists
  if (state.top) {
    const topCard = document.createElement('img');
    topCard.src = '/cards/' + formatCardImage(state.top);
    topCard.classList.add('center-card', 'top-card');
    // Add animation class for smooth fade-in
    topCard.classList.add('fade-in');
    centerPileElement.appendChild(topCard);
  }
}

// Helper function to format a card image filename
function formatCardImage(card) {
  let suitName = '';
  switch(card.suit) {
    case '♠': suitName = 'spades'; break;
    case '♥': suitName = 'hearts'; break;
    case '♦': suitName = 'diamonds'; break;
    case '♣': suitName = 'clubs'; break;
    default: suitName = 'unknown'; break;
  }
  return card.rank + '_' + suitName + '.png';
}

// Function to toggle the lobby menu (sliding menu effect)
function toggleLobbyMenu() {
  const lobbyMenu = document.getElementById('lobbyMenu');
  if (lobbyMenu) {
    lobbyMenu.classList.toggle('visible');
  }
}

// Example: Attach toggle to a button click
const lobbyMenuButton = document.getElementById('lobbyMenuButton');
if (lobbyMenuButton) {
  lobbyMenuButton.addEventListener('click', toggleLobbyMenu);
}

// Socket event handlers
socket.on('lobby-created', ({code, id, name}) => {
  myId = id;
  myLobbyCode = code;
  lobbyCodeSpan.textContent = code;
  createForm.classList.add('hidden');
  joinForm.classList.add('hidden');
  waitingRoom.classList.remove('hidden');
  readyChk.checked = false;
  log('Hai creato la lobby ' + code);
});

socket.on('joined', ({code, id, name}) => {
  myId = id;
  myLobbyCode = code;
  lobbyCodeSpan.textContent = code;
  createForm.classList.add('hidden');
  joinForm.classList.add('hidden');
  waitingRoom.classList.remove('hidden');
  readyChk.checked = false;
  log('Sei dentro come ' + name);
});

socket.on('join-failed', msg => {
  alert(msg);
});

socket.on('game-started', () => {
  lobbyView.classList.remove('active');
  gameView.classList.add('active');
  log('La partita è iniziata!', 'highlight');
});

socket.on('state', state => {
  // Update players list (both waiting room and in-game)
  const list = state.gameStarted ? playersDiv : waitingPlayers;
  list.innerHTML = '';
  
  state.players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player';
    if (p.id === state.turnPlayerId) el.classList.add('active');
    
    // Avatar with first letter
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = p.name[0].toUpperCase();
    
    // Player info
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `
      <div class="name">${p.name} ${state.hostId === p.id ? '<span class="host">👑 Host</span>' : ''}</div>
      <div class="count">${p.handCount ? `${p.handCount} carte` : ''} ${p.ready ? '· Ready' : ''}</div>
    `;
    
    el.appendChild(avatar);
    el.appendChild(info);
    list.appendChild(el);
  });
  
  // Show/hide start button for host
  if (!state.gameStarted) {
    startBtn.classList.toggle('hidden', state.hostId !== myId);
  }
  
  // Update center pile
  centerCount.textContent = state.centerCount ? `${state.centerCount} carte` : 'Vuoto';
  if (state.top) {
    tryLoadCard(state.top.rank, state.top.suit);
  } else {
    centerTop.textContent = '?';
  }

  // Update center pile UI with last and previous cards
  updateCenterPile(state);
});

socket.on('turn-changed', ({playerId, turnIndex}) => {
  // Remove active from all players
  const players = document.querySelectorAll('.player');
  players.forEach(p => p.classList.remove('active'));
  
  // Add active to current player with animation
  const activePlayer = Array.from(players)[turnIndex];
  if (activePlayer) {
    activePlayer.classList.add('active');
    // Scroll into view if needed
    activePlayer.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
  
  // Find player name
  const name = activePlayer ? 
    activePlayer.querySelector('.name').textContent.split('👑')[0].trim() : 
    'Unknown';
  log(`Turno di ${name}`);
});

socket.on('card-played', ({playerId, card, double, special}) => {
  // Find player name
  const player = Array.from(document.querySelectorAll('.player'))
    .find(p => p.textContent.includes(playerId));
  const name = player ? 
    player.querySelector('.name').textContent.split('👑')[0].trim() : 
    'Unknown';
  
  log(`${name} ha buttato ${card.rank}${card.suit}`);
  
  if (double) {
    log('Doppia! Prendi il mazzo!', 'highlight');
    // Flash the center card
    centerTop.animate([
      {filter: 'brightness(1)'},
      {filter: 'brightness(1.5)'},
      {filter: 'brightness(1)'}
    ], {duration: 500});
  }
  
  if (special) {
    log(`${name} ha buttato ${card.rank} - Il prossimo deve buttare ${special.remaining} carte!`, 'highlight');
  }
  
  // Card play animation
  const slot = document.querySelector('.card-slot');
  if (slot) {
    slot.animate([
      {transform: 'scale(1)'},
      {transform: 'scale(1.03)'},
      {transform: 'scale(1)'}
    ], {duration: 220});
  }
});

socket.on('slap-win', ({playerId, wonCount}) => {
  const player = Array.from(document.querySelectorAll('.player'))
    .find(p => p.textContent.includes(playerId));
  const name = player ? 
    player.querySelector('.name').textContent.split('👑')[0].trim() : 
    'Unknown';
  log(`${name} ha vinto il mazzo (${wonCount} carte)!`, 'highlight');
});

socket.on('invalid-slap', ({playerId}) => {
  const player = Array.from(document.querySelectorAll('.player'))
    .find(p => p.textContent.includes(playerId));
  const name = player ? 
    player.querySelector('.name').textContent.split('👑')[0].trim() : 
    'Unknown';
  log(`${name} ha sbagliato lo slap! Penalità.`, 'error');
});

socket.on('penalty-applied', ({playerId}) => {
  const player = Array.from(document.querySelectorAll('.player'))
    .find(p => p.textContent.includes(playerId));
  const name = player ? 
    player.querySelector('.name').textContent.split('👑')[0].trim() : 
    'Unknown';
  log(`${name} penalizzato per spam.`, 'error');
});

socket.on('game-over', ({winnerId}) => {
  const player = Array.from(document.querySelectorAll('.player'))
    .find(p => p.textContent.includes(winnerId));
  const name = player ? 
    player.querySelector('.name').textContent.split('👑')[0].trim() : 
    'Unknown';
  log(`🎉 Partita finita! ${name} ha vinto! 🎉`, 'highlight');
  
  // Victory animation
  gameView.animate([
    {backgroundColor: 'rgba(76,175,80,0.2)'},
    {backgroundColor: 'transparent'}
  ], {duration: 1500});
});

socket.on('error-msg', msg => {
  log('Errore: ' + msg, 'error');
});

// Touch controls: clicking centerTop is a slap
centerTop.addEventListener('click', () => socket.emit('slap'));

// Fullscreen toggle
fsBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.error(err));
  } else {
    document.exitFullscreen();
  }
});
