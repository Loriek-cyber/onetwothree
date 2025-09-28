const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

// Game state (single room for simplicity)
const MAX_PLAYERS = 4;
let players = []; // {id, name, socketId, hand: [], ready: bool}
let deck = [];
let centerPile = [];
let turnIndex = 0;
let gameStarted = false;
let lobbyHostId = null; // player id who can start
let slapCooldown = {}; // socketId -> timestamp for anti-spam

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const d = [];
  for (const s of suits) for (const r of ranks) d.push({suit:s,rank:r});
  return d;
}

function shuffle(array) {
  for (let i = array.length -1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function deal() {
  deck = createDeck();
  shuffle(deck);
  const n = players.length;
  const per = Math.floor(deck.length / n);
  // clear hands
  players.forEach(p => p.hand = []);
  // deal per cards to each player in round-robin
  let idx = 0;
  for (let i = 0; i < per * n; i++) {
    players[idx].hand.push(deck[i]);
    idx = (idx + 1) % n;
  }
  // remove dealt cards from deck (they are distributed)
  deck = deck.slice(per*n);
}

function broadcastState() {
  const publicPlayers = players.map(p=>({id:p.id,name:p.name,handCount:p.hand.length, socketId:p.socketId, ready: !!p.ready}));
  io.emit('state',{
    players: publicPlayers,
    centerCount: centerPile.length,
    top: centerPile.length? centerPile[centerPile.length-1] : null,
    turnPlayerId: players.length? players[turnIndex].id : null,
    gameStarted,
    lobbyHostId
  });
}

function nextTurn(skip=1) {
  if (!players.length) return;
  let attempts = 0;
  do {
    turnIndex = (turnIndex + skip) % players.length;
    attempts++;
    // if this player has no cards, skip them
    if (players[turnIndex].hand.length > 0) break;
  } while (attempts <= players.length);
}

io.on('connection', socket => {
  console.log('conn', socket.id);

  socket.on('join', name => {
    if (players.length >= MAX_PLAYERS) {
      socket.emit('join-failed','Room full');
      return;
    }
    const id = Math.random().toString(36).slice(2,9);
    players.push({id,name, socketId: socket.id, hand: [], ready: false});
    socket.data.playerId = id;
    socket.emit('joined', {id, name});
    // first player is lobby host
    if (!lobbyHostId) lobbyHostId = id;
    broadcastState();
  });

  socket.on('set-ready', ready => {
    const pid = socket.data.playerId;
    const p = players.find(x=>x.id===pid);
    if (p) p.ready = !!ready;
    broadcastState();
  });

  socket.on('start', ()=>{
    const pid = socket.data.playerId;
    if (pid !== lobbyHostId) {
      socket.emit('error-msg','Only host can start');
      return;
    }
    if (gameStarted) return;
    if (players.length < 2) {
      socket.emit('error-msg','Need 2+ players to start');
      return;
    }
    // require all ready
    if (!players.every(p=>p.ready)) {
      socket.emit('error-msg','All players must be ready');
      return;
    }
    deal();
    centerPile = [];
    turnIndex = 0;
    gameStarted = true;
    // reset readiness
    players.forEach(p=> p.ready = false);
    broadcastState();
  });

  socket.on('play-card', ()=>{
    if (!gameStarted) return;
    const pid = socket.data.playerId;
    const playerIdx = players.findIndex(p=>p.id === pid);
    if (playerIdx === -1) return;
    if (playerIdx !== turnIndex) {
      socket.emit('error-msg','Not your turn');
      return;
    }
    const player = players[playerIdx];
    if (player.hand.length === 0) {
      socket.emit('error-msg','No cards to play');
      return;
    }
    const card = player.hand.shift();
    centerPile.push(card);

    // check for double: current card same as previous
    let double = false;
    if (centerPile.length >= 2) {
      const prev = centerPile[centerPile.length-2];
      const cur = card;
      if (prev.rank === cur.rank) double = true;
    }

    // initialise server specialRequirement store if missing
    io.sockets.server.specialRequirement = io.sockets.server.specialRequirement || null;

    // helper to create special requirement (store initiator by id to survive reindexes)
    function makeSpecial(rank, initiatorId) {
      let count = 0;
      if (rank === 'A') count = 1;
      if (rank === '2') count = 2;
      if (rank === '3') count = 3;
      if (count > 0) return {count, remaining: count, initiatorId};
      return null;
    }

    // if we are currently in a special requirement
    if (io.sockets.server.specialRequirement) {
      const req = io.sockets.server.specialRequirement;
      // if the played card is A/2/3, start a new requirement with this player as initiator
      const newSpec = makeSpecial(card.rank, player.id);
      if (newSpec) {
        io.sockets.server.specialRequirement = newSpec;
        io.emit('card-played',{playerId: player.id, card, double, special: io.sockets.server.specialRequirement});
        // move to next player to respond to new requirement
        nextTurn(1);
        broadcastState();
        return;
      }

      // otherwise decrement remaining
      req.remaining -= 1;
      io.emit('card-played',{playerId: player.id, card, double, special: req});

      if (req.remaining <= 0) {
        // requirement failed to be countered: initiator wins the center pile
        const initiator = players.find(p=>p.id === req.initiatorId);
        if (initiator) {
          const won = centerPile.splice(0, centerPile.length);
          initiator.hand.push(...won);
          io.emit('special-resolve',{winnerId: initiator.id, wonCount: won.length});
          // set turn to initiator index
          const newIdx = players.findIndex(p=>p.id === initiator.id);
          if (newIdx !== -1) turnIndex = newIdx;
        }
        io.sockets.server.specialRequirement = null;
        broadcastState();
        return;
      }

      // still pending: advance to next player who must continue playing
      nextTurn(1);
      broadcastState();
      return;
    }

    // no existing special requirement: if this card is A/2/3, create one
    const special = makeSpecial(card.rank, player.id);
    if (special) {
      io.sockets.server.specialRequirement = special;
    }

    io.emit('card-played',{playerId: player.id, card, double, special: io.sockets.server.specialRequirement});
    nextTurn(1);
    broadcastState();
  });

  socket.on('slap', ()=>{
    if (!gameStarted) return;
    const now = Date.now();
    const last = slapCooldown[socket.id] || 0;
    // simple anti-spam: 700ms
    if (now - last < 700) {
      // penalty: drop one card from player's hand to bottom of center pile (if they have any)
      const pid = socket.data.playerId;
      const p = players.find(x=>x.id===pid);
      if (p && p.hand.length>0) {
        const c = p.hand.pop();
        centerPile.unshift(c); // put at bottom of center
        socket.emit('penalty','spam');
        io.emit('penalty-applied',{playerId: p.id});
      }
      slapCooldown[socket.id] = now;
      broadcastState();
      return;
    }
    slapCooldown[socket.id] = now;

    // valid slap if top two are equal
    if (centerPile.length >= 2) {
      const top = centerPile[centerPile.length-1];
      const prev = centerPile[centerPile.length-2];
      if (top.rank === prev.rank) {
        // winner gets entire center pile appended to their hand bottom
        const pid = socket.data.playerId;
        const p = players.find(x=>x.id===pid);
        if (p) {
          // winner gets center pile in order
          const won = centerPile.splice(0, centerPile.length);
          p.hand.push(...won);
          io.emit('slap-win',{playerId: p.id, wonCount: won.length});
          // if someone now has all cards (52) they win
          if (p.hand.length === 52) {
            io.emit('game-over',{winnerId: p.id});
            gameStarted = false;
          }
          broadcastState();
          return;
        }
      }
    }
    // invalid slap -> penalty
    const pid = socket.data.playerId;
    const p = players.find(x=>x.id===pid);
    if (p && p.hand.length>0) {
      const c = p.hand.pop();
      centerPile.unshift(c);
      io.emit('invalid-slap',{playerId: p.id});
    }
    broadcastState();
  });

  socket.on('disconnect', ()=>{
    const pid = socket.data.playerId;
    const idx = players.findIndex(p=>p.id === pid);
    if (idx !== -1) players.splice(idx,1);
    // transfer host if needed
    if (lobbyHostId === pid) {
      lobbyHostId = players.length? players[0].id : null;
    }
    // if specialRequirement existed and initiator left, clear it
    if (io.sockets.server.specialRequirement && io.sockets.server.specialRequirement.initiatorId === pid) {
      io.sockets.server.specialRequirement = null;
    }
    // if no players left, reset game
    if (!players.length) {
      deck = [];
      centerPile = [];
      gameStarted = false;
    } else {
      // ensure turnIndex points to a valid player; if the removed player was before current index adjust
      if (idx !== -1 && idx < turnIndex) {
        turnIndex = Math.max(0, turnIndex - 1);
      }
      if (turnIndex >= players.length) turnIndex = 0;
    }
    broadcastState();
  });
});

server.listen(PORT, ()=> console.log('Server listening on', PORT));
