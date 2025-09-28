const { handleSpecialRequirement } = require('../game/specialRules');

describe('Special Rules', () => {
  let mockLobby;
  let mockPlayer;
  let mockSocket;
  
  beforeEach(() => {
    mockLobby = {
      specialRequirement: null,
      centerPile: [],
      players: [
        { id: 'p1', name: 'Player 1', hand: [] },
        { id: 'p2', name: 'Player 2', hand: [] }
      ]
    };
    
    mockPlayer = mockLobby.players[0];
    mockSocket = { emit: jest.fn() };
  });
  
  test('Should start new requirement when A/2/3 is played', () => {
    const card = { rank: 'A', suit: '♠' };
    const result = handleSpecialRequirement(mockLobby, card, mockPlayer, mockSocket);
    
    expect(result.type).toBe('start');
    expect(result.count).toBe(1);
    expect(mockLobby.specialRequirement).toEqual({
      count: 1,
      cardsPlayed: [],
      initiatorId: 'p1',
      cardRank: 'A'
    });
  });
  
  test('Should continue requirement when normal card is played', () => {
    mockLobby.specialRequirement = {
      count: 2,
      cardsPlayed: [],
      initiatorId: 'p2',
      cardRank: '2'
    };
    
    const card = { rank: '7', suit: '♥' };
    const result = handleSpecialRequirement(mockLobby, card, mockPlayer, mockSocket);
    
    expect(result.type).toBe('continue');
    expect(mockLobby.specialRequirement.cardsPlayed).toHaveLength(1);
  });
  
  test('Should chain when new special card is played during requirement', () => {
    mockLobby.specialRequirement = {
      count: 2,
      cardsPlayed: [],
      initiatorId: 'p2',
      cardRank: '2'
    };
    
    const card = { rank: '3', suit: '♣' };
    const result = handleSpecialRequirement(mockLobby, card, mockPlayer, mockSocket);
    
    expect(result.type).toBe('chain');
    expect(result.newCount).toBe(3);
    expect(mockLobby.specialRequirement.count).toBe(3);
  });
  
  test('Should complete requirement after correct number of cards', () => {
    mockLobby.specialRequirement = {
      count: 1,
      cardsPlayed: [],
      initiatorId: 'p2',
      cardRank: 'A'
    };
    mockLobby.centerPile = [{ rank: 'A', suit: '♠' }];
    
    const card = { rank: '8', suit: '♦' };
    const result = handleSpecialRequirement(mockLobby, card, mockPlayer, mockSocket);
    
    expect(result.type).toBe('complete');
    expect(mockLobby.specialRequirement).toBeNull();
  });
  
  test('Should detect double during requirement', () => {
    mockLobby.specialRequirement = {
      count: 2,
      cardsPlayed: [],
      initiatorId: 'p2',
      cardRank: '2'
    };
    mockLobby.centerPile = [{ rank: '7', suit: '♠' }];
    
    const card = { rank: '7', suit: '♥' };
    const result = handleSpecialRequirement(mockLobby, card, mockPlayer, mockSocket);
    
    expect(result.type).toBe('double');
    expect(result.slappable).toBe(true);
  });
});