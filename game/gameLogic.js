const logger = require('../utils/logger');

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit similar looking chars
  let code;
  do {
    code = Array(6).fill(0)
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');
  } while(global.lobbies && global.lobbies.has(code));
  return code;
}

function createLobby() {
  const lobby = {
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
  logger.gameEvent('lobby_created', { 
    lobbyCode: lobby.code 
  });
  return lobby;
}

function makeSpecial(rank, initiatorId) {
  let count = 0;
  if (rank === 'A') count = 1;
  if (rank === '2') count = 2;
  if (rank === '3') count = 3;
  if (count > 0) {
    logger.gameEvent('special_requirement_created', {
      rank,
      count,
      initiatorId
    });
    return { count, remaining: count, initiatorId, cardRank: rank };
  }
  return null;
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({suit, rank});
    }
  }
  logger.gameEvent('deck_created', { count: deck.length });
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  logger.gameEvent('deck_shuffled');
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

  // remove dealt cards from deck
  lobby.deck = lobby.deck.slice(per * n);

  logger.gameEvent('cards_dealt', {
    playerCount: n,
    cardsPerPlayer: per,
    remainingInDeck: lobby.deck.length
  });
}

function isValidPlay(card, requirement) {
  if (!requirement) return true;

  const special = makeSpecial(card.rank);
  if (!special) return false;
  
  return special.count >= requirement.count;
}

function resolveSpecialRequirement(lobby, initiatorId) {
  const initiator = lobby.players.find(p => p.id === initiatorId);
  if (!initiator) {
    logger.gameError('Initiator not found', { initiatorId });
    return false;
  }

  const won = lobby.centerPile.splice(0, lobby.centerPile.length);
  initiator.hand.push(...won);

  logger.gameEvent('special_requirement_resolved', {
    winnerId: initiator.id,
    cardCount: won.length,
    initiatorId
  });

  return true;
}

module.exports = {
  createLobby,
  makeSpecial,
  createDeck,
  shuffle,
  deal,
  isValidPlay,
  resolveSpecialRequirement,
  generateLobbyCode
};