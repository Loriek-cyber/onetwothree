// Keyboard controls
document.addEventListener('keydown', (e) => {
  // Space bar or Enter for slap
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault(); // Prevent page scroll
    handleSlap();
  }
  
  // P key for play card
  if (e.code === 'KeyP') {
    e.preventDefault();
    handlePlayCard();
  }
  
  // R key for ready toggle
  if (e.code === 'KeyR') {
    e.preventDefault();
    toggleReady();
  }
});

// Add key bindings info to UI
const keyBindings = document.createElement('div');
keyBindings.className = 'key-bindings';
keyBindings.innerHTML = `
  <h3>Controlli da Tastiera:</h3>
  <ul>
    <li><kbd>Spazio</kbd> o <kbd>Invio</kbd> - Prendi il mazzo</li>
    <li><kbd>P</kbd> - Gioca carta</li>
    <li><kbd>R</kbd> - Pronto/Non pronto</li>
  </ul>
`;
document.body.appendChild(keyBindings);