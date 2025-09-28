const winston = require('winston');
const { format, transports } = winston;

// Configure log format
const logFormat = format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` | ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create the logger
const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    logFormat
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        logFormat
      )
    })
  ],
  exceptionHandlers: [
    new transports.File({ filename: 'logs/exceptions.log' })
  ]
});

// Add convenience methods for game events
logger.gameEvent = (eventName, data) => {
  logger.info(eventName, { type: 'game_event', ...data });
};

logger.gameError = (error, context) => {
  logger.error(error.message || error, { 
    type: 'game_error',
    stack: error.stack,
    ...context 
  });
};

logger.stateChange = (lobbyCode, description, changes) => {
  logger.info(`[Lobby ${lobbyCode}] ${description}`, { 
    type: 'state_change',
    lobby: lobbyCode,
    changes 
  });
};

logger.playerAction = (lobbyCode, playerId, action, details) => {
  logger.info(`[Lobby ${lobbyCode}] Player ${playerId}: ${action}`, { 
    type: 'player_action',
    lobby: lobbyCode,
    player: playerId,
    action,
    details 
  });
};

module.exports = logger;