const { createLobby, makeSpecial, deal } = require('../game/gameLogic');

describe('Game Logic', () => {
  describe('createLobby', () => {
    it('should create a new lobby with correct initial state', () => {
      const lobby = createLobby();
      
      expect(lobby).toHaveProperty('code');
      expect(lobby.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(lobby.players).toEqual([]);
      expect(lobby.deck).toEqual([]);
      expect(lobby.centerPile).toEqual([]);
      expect(lobby.turnIndex).toBe(0);
      expect(lobby.gameStarted).toBe(false);
      expect(lobby.hostId).toBeNull();
      expect(lobby.slapCooldown).toEqual({});
      expect(lobby.specialRequirement).toBeNull();
    });
  });

  describe('makeSpecial', () => {
    it('should create correct special requirement for A', () => {
      const special = makeSpecial('A', 'player1');
      expect(special).toEqual({
        count: 1,
        remaining: 1,
        initiatorId: 'player1',
        cardRank: 'A'
      });
    });

    it('should create correct special requirement for 2', () => {
      const special = makeSpecial('2', 'player1');
      expect(special).toEqual({
        count: 2,
        remaining: 2,
        initiatorId: 'player1',
        cardRank: '2'
      });
    });

    it('should create correct special requirement for 3', () => {
      const special = makeSpecial('3', 'player1');
      expect(special).toEqual({
        count: 3,
        remaining: 3,
        initiatorId: 'player1',
        cardRank: '3'
      });
    });

    it('should return null for non-special cards', () => {
      expect(makeSpecial('4', 'player1')).toBeNull();
      expect(makeSpecial('K', 'player1')).toBeNull();
      expect(makeSpecial('Q', 'player1')).toBeNull();
    });
  });

  describe('deal', () => {
    it('should deal cards evenly to all players', () => {
      const lobby = {
        players: [
          { id: 'p1', hand: [] },
          { id: 'p2', hand: [] },
          { id: 'p3', hand: [] },
          { id: 'p4', hand: [] }
        ],
        deck: []
      };

      deal(lobby);

      // Each player should get 13 cards (52 cards / 4 players)
      lobby.players.forEach(p => {
        expect(p.hand).toHaveLength(13);
      });

      // All cards should be dealt (no cards left in deck)
      expect(lobby.deck).toHaveLength(0);

      // Check all cards are unique
      const allCards = lobby.players.flatMap(p => p.hand);
      const uniqueCards = new Set(allCards.map(c => `${c.rank}${c.suit}`));
      expect(uniqueCards.size).toBe(52);
    });

    it('should deal with uneven number of players', () => {
      const lobby = {
        players: [
          { id: 'p1', hand: [] },
          { id: 'p2', hand: [] },
          { id: 'p3', hand: [] }
        ],
        deck: []
      };

      deal(lobby);

      // Each player should get 17 cards (51 cards / 3 players, 1 card remains in deck)
      lobby.players.forEach(p => {
        expect(p.hand).toHaveLength(17);
      });

      expect(lobby.deck).toHaveLength(1);
    });
  });
});