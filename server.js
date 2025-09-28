const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
const gameLogic = require('./game/gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

// Log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, { 
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Game state - multiple lobbies
const MAX_PLAYERS = 4;
const LOBBY_CODE_LENGTH = 6;

// Map of lobby code -> lobby state
const lobbies = new Map();

// Map of socket id -> lobby code for quick lookups
const playerLobbies = new Map();

// Generate random lobby code
function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit similar looking chars
  let code;
  do {
    code = Array(LOBBY_CODE_LENGTH).fill(0)
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');
  } while(lobbies.has(code));
  return code;
}

// Create new lobby state
function createLobby() {
  return {
    code: generateLobbyCode(),
    players: [], // {id, name, socketId, hand: [], ready: bool}
    deck: [],
    centerPile: [],
    turnIndex: 0,
    gameStarted: false,
    hostId: null,
    slapCooldown: {}, // socketId -> timestamp for anti-spam
    specialRequirement: null
  };
}

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

function deal(lobby) {
  lobby.deck = createDeck();
  shuffle(lobby.deck);
  const n = lobby.players.length;
  const per = Math.floor(lobby.deck.length / n);
  // clear hands
  lobby.players.forEach(p => p.hand = []);
  // deal per cards to each player in round-robin
  let idx = 0;
  for (let i = 0; i < per * n; i++) {
    lobby.players[idx].hand.push(lobby.deck[i]);
    idx = (idx + 1) % n;
  }
  // remove dealt cards from deck (they are distributed)
  lobby.deck = lobby.deck.slice(per*n);
}

function getPublicState(lobby) {
  const publicPlayers = lobby.players.map(p => ({
    id: p.id,
    name: p.name,
    handCount: p.hand.length,
    socketId: p.socketId,
    ready: !!p.ready
  }));
  return {
    players: publicPlayers,
    centerCount: lobby.centerPile.length,
    top: lobby.centerPile.length ? lobby.centerPile[lobby.centerPile.length-1] : null,
    turnPlayerId: lobby.players.length ? lobby.players[lobby.turnIndex].id : null,
    gameStarted: lobby.gameStarted,
    hostId: lobby.hostId,
    code: lobby.code
  };
}

function broadcastState(lobby) {
  io.to(lobby.code).emit('state', getPublicState(lobby));
}

function nextTurn(lobby, skip=1) {
  if (!lobby.players.length) return;
  let attempts = 0;
  do {
    lobby.turnIndex = (lobby.turnIndex + skip) % lobby.players.length;
    attempts++;
    // if this player has no cards, skip them
    if (lobby.players[lobby.turnIndex].hand.length > 0) break;
  } while (attempts <= lobby.players.length);
  // emit turn change event for visual feedback
  io.to(lobby.code).emit('turn-changed', {
    playerId: lobby.players[lobby.turnIndex].id,
    turnIndex: lobby.turnIndex
  });
}

io.on('connection', socket => {
  console.log('conn', socket.id);

  // Create a new lobby
  socket.on('create-lobby', name => {
    const lobby = createLobby();
    const id = Math.random().toString(36).slice(2,9);
    
    lobby.players.push({id, name, socketId: socket.id, hand: [], ready: false});
    lobby.hostId = id;
    
    socket.data.playerId = id;
    socket.join(lobby.code); // Join socket.io room
    playerLobbies.set(socket.id, lobby.code);
    
    lobbies.set(lobby.code, lobby);
    socket.emit('lobby-created', {code: lobby.code, id, name});
    io.to(lobby.code).emit('state', getPublicState(lobby));
  });

  // Join existing lobby
  socket.on('join-lobby', ({code, name}) => {
    code = code.toUpperCase();
    const lobby = lobbies.get(code);
    if (!lobby) {
      socket.emit('join-failed', 'Lobby not found');
      return;
    }
    if (lobby.gameStarted) {
      socket.emit('join-failed', 'Game already in progress');
      return;
    }
    if (lobby.players.length >= MAX_PLAYERS) {
      socket.emit('join-failed', 'Lobby full');
      return;
    }
    
    const id = Math.random().toString(36).slice(2,9);
    lobby.players.push({id, name, socketId: socket.id, hand: [], ready: false});
    
    socket.data.playerId = id;
    socket.join(code); // Join socket.io room
    playerLobbies.set(socket.id, code);
    
    socket.emit('joined', {code, id, name});
    io.to(code).emit('state', getPublicState(lobby));
  });

  socket.on('set-ready', ready => {
    const pid = socket.data.playerId;
    const lobbyCode = playerLobbies.get(socket.id);
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;
    
    const p = lobby.players.find(x=>x.id===pid);
    if (p) p.ready = !!ready;
    broadcastState(lobby);
  });

  socket.on('start', ()=>{
    const pid = socket.data.playerId;
    const lobbyCode = playerLobbies.get(socket.id);
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    if (pid !== lobby.hostId) {
      socket.emit('error-msg','Only host can start');
      return;
    }
    if (lobby.gameStarted) return;
    if (lobby.players.length < 2) {
      socket.emit('error-msg','Need 2+ players to start');
      return;
    }
    // require all ready
    if (!lobby.players.every(p=>p.ready)) {
      socket.emit('error-msg','All players must be ready');
      return;
    }
    deal(lobby);
    lobby.centerPile = [];
    lobby.turnIndex = 0;
    lobby.gameStarted = true;
    // reset readiness
    lobby.players.forEach(p=> p.ready = false);
    broadcastState(lobby);
    // emit game-started for fullscreen transition
    io.to(lobby.code).emit('game-started');
  });

  socket.on('play-card', ()=>{
    const pid = socket.data.playerId;
    const lobbyCode = playerLobbies.get(socket.id);
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || !lobby.gameStarted) return;
    
    const playerIdx = lobby.players.findIndex(p=>p.id === pid);
    if (playerIdx === -1) return;
    
    // Only validate turn if we're not in a special requirement
    if (!lobby.specialRequirement && playerIdx !== lobby.turnIndex) {
      socket.emit('error-msg','Not your turn');
      return;
    }
    
    const player = lobby.players[playerIdx];
    if (player.hand.length === 0) {
      socket.emit('error-msg','No cards to play');
      return;
    }
    
    const card = player.hand.shift();
    lobby.centerPile.push(card);

    // Import special rules handler
    const { handleSpecialRequirement } = require('./game/specialRules');
    
    // Handle special rules
    const result = handleSpecialRequirement(lobby, card, player, socket);
    
    // check for double: current card same as previous (still needed for non-special cases)
    let double = false;
    if (lobby.centerPile.length >= 2) {
      const prev = lobby.centerPile[lobby.centerPile.length-2];
      const cur = card;
      if (prev.rank === cur.rank) {
        double = true;
        io.to(lobby.code).emit('double-available');
      }
    }

    // if we are currently in a special requirement
    if (lobby.specialRequirement) {
      const req = lobby.specialRequirement;
      
      // Check if the played card is valid for responding to special requirement
      const playedSpecial = makeSpecial(card.rank, player.id);
      if (!playedSpecial) {
        // Must play A/2/3 to respond
        socket.emit('error-msg', 'Must play A, 2, or 3 to respond');
        // Return card to hand
        player.hand.unshift(card);
        lobby.centerPile.pop();
        broadcastState(lobby);
        return;
      }
      
      // Check if played card has equal or higher count than requirement
      if (playedSpecial.count < req.count) {
        socket.emit('error-msg', 'Must play equal or higher value card');
        // Return card to hand
        player.hand.unshift(card);
        lobby.centerPile.pop();
        broadcastState(lobby);
        return;
      }

      // If the card wasn't a special card or was too low, the current requirement fails
      // and the previous initiator wins the pile
      const failedResponse = !playedSpecial || playedSpecial.count < req.count;
      if (failedResponse) {
        const initiator = lobby.players.find(p => p.id === req.initiatorId);
        if (initiator) {
          const won = lobby.centerPile.splice(0, lobby.centerPile.length);
          initiator.hand.push(...won);
          
          // Emit detailed special resolve event
          io.to(lobby.code).emit('special-resolve', {
            winnerId: initiator.id, 
            wonCount: won.length,
            reason: 'Failed to counter with valid card',
            nextTurn: initiator.name,
            requirementRank: req.cardRank
          });

          // Emit turn notification to make it very clear
          io.to(lobby.code).emit('requirement-complete', {
            winner: initiator.name,
            wonCards: won.length,
            nextTurn: initiator.name,
            message: `${initiator.name} wins ${won.length} cards! It's their turn now.`
          });

          // set turn to initiator
          const newIdx = lobby.players.findIndex(p => p.id === initiator.id);
          if (newIdx !== -1) {
            lobby.turnIndex = newIdx;
            // Also emit turn change event
            io.to(lobby.code).emit('turn-changed', {
              playerId: initiator.id,
              turnIndex: newIdx,
              reason: 'Won special requirement'
            });
          }
        }
        lobby.specialRequirement = null;
        broadcastState(lobby);
        return;
      }

      // Valid response - start a new requirement with this player as initiator
      io.to(lobby.code).emit('card-played', {playerId: player.id, card, double, special: lobby.specialRequirement});
      // move to next player to respond to new requirement  
      nextTurn(lobby, 1);
      broadcastState(lobby);
      return;

      // Valid response - apply the chain requirement
      const newChain = {
        count: playedSpecial.count,
        remaining: playedSpecial.count,
        initiatorId: player.id,
        previousInitiatorId: req.initiatorId, // track previous initiator for chain resolution
        cardRank: card.rank // store the rank that started this requirement
      };
      
      lobby.specialRequirement = newChain;
      
      // Emit detailed event about the chain
      io.to(lobby.code).emit('card-played', {
        playerId: player.id, 
        card, 
        double,
        special: newChain,
        chainedFrom: req.initiatorId,
        requirementType: 'chain',
        message: `${player.name} countered with ${card.rank} - next player must play ${card.rank} or higher!`
      });

      // Emit special event to make turn order clear
      const nextPlayer = lobby.players[(lobby.turnIndex + 1) % lobby.players.length];
      io.to(lobby.code).emit('requirement-chained', {
        previousPlayer: player.name,
        nextPlayer: nextPlayer.name,
        cardRank: card.rank,
        cardsNeeded: newChain.count
      });

      // Move to next player to respond to new requirement
      nextTurn(lobby, 1);
      broadcastState(lobby);
      return;
    }

    // no existing special requirement: if this card is A/2/3, create one
    const special = makeSpecial(card.rank, player.id);
    if (special) {
      lobby.specialRequirement = special;
    }

    io.to(lobby.code).emit('card-played', {playerId: player.id, card, double, special: lobby.specialRequirement});
    nextTurn(lobby, 1);
    broadcastState(lobby);
  });

  socket.on('slap', ()=>{
    const lobbyCode = playerLobbies.get(socket.id);
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || !lobby.gameStarted) return;

    const now = Date.now();
    const last = lobby.slapCooldown[socket.id] || 0;
    // simple anti-spam: 700ms
    if (now - last < 700) {
      // penalty: drop one card from player's hand to bottom of center pile (if they have any)
      const pid = socket.data.playerId;
      const p = lobby.players.find(x=>x.id===pid);
      if (p && p.hand.length>0) {
        const c = p.hand.pop();
        lobby.centerPile.unshift(c); // put at bottom of center
        socket.emit('penalty','spam');
        io.to(lobby.code).emit('penalty-applied',{playerId: p.id});
      }
      lobby.slapCooldown[socket.id] = now;
      broadcastState(lobby);
      return;
    }
    lobby.slapCooldown[socket.id] = now;

    // valid slap if top two are equal
    if (lobby.centerPile.length >= 2) {
      const top = lobby.centerPile[lobby.centerPile.length-1];
      const prev = lobby.centerPile[lobby.centerPile.length-2];
      if (top.rank === prev.rank) {
        // winner gets entire center pile appended to their hand bottom
        const pid = socket.data.playerId;
        const p = lobby.players.find(x=>x.id===pid);
        if (p) {
          // winner gets center pile in order
          const won = lobby.centerPile.splice(0, lobby.centerPile.length);
          p.hand.push(...won);
          io.to(lobby.code).emit('slap-win',{playerId: p.id, wonCount: won.length});
          // if someone now has all cards (52) they win
          if (p.hand.length === 52) {
            io.to(lobby.code).emit('game-over',{winnerId: p.id});
            lobby.gameStarted = false;
          }
          broadcastState(lobby);
          return;
        }
      }
    }
    // invalid slap -> penalty
    const pid = socket.data.playerId;
    const p = lobby.players.find(x=>x.id===pid);
    if (p && p.hand.length>0) {
      const c = p.hand.pop();
      lobby.centerPile.unshift(c);
      io.to(lobby.code).emit('invalid-slap',{playerId: p.id});
    }
    broadcastState(lobby);
  });

  socket.on('disconnect', ()=>{
    const lobbyCode = playerLobbies.get(socket.id);
    if (!lobbyCode) return;

    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    const pid = socket.data.playerId;
    const idx = lobby.players.findIndex(p=>p.id === pid);
    if (idx !== -1) lobby.players.splice(idx,1);

    // Clean up player-lobby mapping
    playerLobbies.delete(socket.id);

    // transfer host if needed
    if (lobby.hostId === pid) {
      lobby.hostId = lobby.players.length ? lobby.players[0].id : null;
    }

    // if specialRequirement existed and initiator left, clear it
    if (lobby.specialRequirement && lobby.specialRequirement.initiatorId === pid) {
      lobby.specialRequirement = null;
    }

    // if no players left, delete lobby
    if (!lobby.players.length) {
      lobbies.delete(lobbyCode);
    } else {
      // ensure turnIndex points to a valid player
      if (idx !== -1 && idx < lobby.turnIndex) {
        lobby.turnIndex = Math.max(0, lobby.turnIndex - 1);
      }
      if (lobby.turnIndex >= lobby.players.length) lobby.turnIndex = 0;
      broadcastState(lobby);
    }
  });
});

server.listen(PORT, ()=> console.log('Server listening on', PORT));
