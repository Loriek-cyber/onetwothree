// Game state management for special requirements (A/2/3)
// Initialize a simple logger
const logger = {
  gameEvent: (eventName, data) => console.log(`[GameEvent] ${eventName}:`, data),
  error: (msg, data) => console.error(`[Error] ${msg}:`, data),
  info: (msg, data) => console.log(`[Info] ${msg}:`, data)
};

function handleSpecialRequirement(lobby, card, player, socket) {

  // If we're in the middle of fulfilling a requirement
  if (lobby.specialRequirement) {
    // Track the played card
    lobby.specialRequirement.cardsPlayed.push(card);
    
    logger.gameEvent('requirement_card_played', {
      playerId: player.id,
      card,
      requirement: lobby.specialRequirement
    });

    // Check for doubles with previous card
    const isDouble = lobby.centerPile.length >= 2 && 
      lobby.centerPile[lobby.centerPile.length-1].rank === 
      lobby.centerPile[lobby.centerPile.length-2].rank;
    
    if (isDouble) {
      logger.gameEvent('double_during_requirement', {
        cards: [
          lobby.centerPile[lobby.centerPile.length-2],
          lobby.centerPile[lobby.centerPile.length-1]
        ]
      });
      // Double found - any player can now slap
      return { type: 'double', slappable: true };
    }

    // Check if this card is another A/2/3
    const newCount = getSpecialCount(card.rank);
    if (newCount > 0) {
      logger.gameEvent('new_requirement_during_requirement', {
        oldReq: lobby.specialRequirement,
        newCard: card
      });
      // Start a new requirement chain
      lobby.specialRequirement = {
        count: newCount,
        cardsPlayed: [],
        initiatorId: player.id,
        cardRank: card.rank
      };
      return { type: 'chain', newCount };
    }

    // Check if we've played enough cards
    if (lobby.specialRequirement.cardsPlayed.length >= lobby.specialRequirement.count) {
      // Requirement fulfilled without special events - initiator gets the pile
      const initiator = lobby.players.find(p => p.id === lobby.specialRequirement.initiatorId);
      if (initiator) {
        const won = lobby.centerPile.splice(0, lobby.centerPile.length);
        initiator.hand.push(...won);
        logger.gameEvent('requirement_complete', {
          initiatorId: initiator.id,
          cardsWon: won.length
        });
        lobby.specialRequirement = null;
        return { type: 'complete', winner: initiator, cards: won.length };
      }
    }

    return { type: 'continue' };
  }

  // Check if this is a new special card
  const count = getSpecialCount(card.rank);
  if (count > 0) {
    lobby.specialRequirement = {
      count,
      cardsPlayed: [],
      initiatorId: player.id,
      cardRank: card.rank
    };
    logger.gameEvent('new_requirement_started', lobby.specialRequirement);
    return { type: 'start', count };
  }

  return { type: 'normal' };
}

function getSpecialCount(rank) {
  if (rank === 'A') return 1;
  if (rank === '2') return 2;
  if (rank === '3') return 3;
  return 0;
}

module.exports = { handleSpecialRequirement, getSpecialCount };