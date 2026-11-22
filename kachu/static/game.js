// Game.js for the game screen
class KachuGameUI {
    constructor(gameId) {
        this.gameId = gameId;
        this.socket = io();
        this.gameState = null;
        this.humanPlayerIndex = 0;
        this.aiIntelligence = 5;
        this.currentHint = null;
        this.setupSocketListeners();
        this.setupEventListeners();
        this.setupAIControls();
        this.joinGame();
    }

    setupSocketListeners() {
        this.socket.on('game_joined', (data) => {
            console.log('Joined game:', data);
            this.updateGameState(data.game_state);
        });

        this.socket.on('round_started', (data) => {
            console.log('Round started:', data);
            this.updateGameState(data.game_state);
            
            // Check if human player still needs to make prediction
            const humanPlayer = data.game_state.players[this.humanPlayerIndex];
            if (humanPlayer.predicted_tricks === null) {
                this.showStatus('New round started! Make your prediction.');
                this.showBiddingModal();
            } else if (data.game_state.phase === 'playing') {
                this.showStatus('All predictions made! Let\'s play!');
                if (data.game_state.current_player === this.humanPlayerIndex) {
                    this.showStatus('Your turn! Play a card.');
                }
            } else {
                this.showStatus('Round started. Waiting for all predictions...');
            }
        });

        this.socket.on('prediction_made', (data) => {
            console.log('Prediction made:', data);
            this.updateGameState(data.game_state);
            
            // Reset the confirm button
            const confirmBtn = document.getElementById('confirmPrediction');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Prediction';
            }
            
            this.hideBiddingModal();
            
            if (data.game_state.phase === 'playing') {
                this.showStatus('All predictions made! Let\'s play!');
                
                // If it's the human player's turn, show status
                if (data.game_state.current_player === this.humanPlayerIndex) {
                    this.showStatus('Your turn! Play a card.');
                } else {
                    const currentPlayer = data.game_state.players[data.game_state.current_player];
                    this.showStatus(`${currentPlayer.name}'s turn to play...`);
                }
            } else {
                this.showStatus('Waiting for other players to make predictions...');
            }
        });

        this.socket.on('card_played', (data) => {
            console.log('Card played:', data);
            this.updateGameState(data.game_state);
            this.updateTrickArea();
            this.updatePlayerHand();
            this.updatePlayersArea();
            
            if (data.game_state.phase === 'round_end') {
                setTimeout(() => {
                    this.showRoundResults();
                }, 2000);
            } else if (data.game_state.current_player === this.humanPlayerIndex) {
                this.showStatus('Your turn! Play a card.');
            } else {
                const currentPlayer = data.game_state.players[data.game_state.current_player];
                this.showStatus(`Waiting for ${currentPlayer.name} to play...`);
            }
        });

        this.socket.on('game_continued', (data) => {
            console.log('Game continued:', data);
            this.updateGameState(data.game_state);
            this.hideRoundResults();
            
            if (data.game_state.phase === 'game_end') {
                this.showGameOver();
            } else {
                this.showBiddingModal();
            }
        });

        this.socket.on('game_state_update', (data) => {
            console.log('Game state update:', data);
            this.updateGameState(data.game_state);
        });

        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            this.showStatus(`Error: ${data.message}`);
            
            // Re-enable button if there was an error
            const confirmBtn = document.getElementById('confirmPrediction');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Prediction';
            }
        });
        
        this.socket.on('ai_intelligence_updated', (data) => {
            console.log('AI intelligence updated:', data);
            this.aiIntelligence = data.intelligence_level;
            const gameAiValue = document.getElementById('gameAiValue');
            if (gameAiValue) {
                gameAiValue.textContent = this.aiIntelligence;
            }
        });

        this.socket.on('hint_received', (data) => {
            console.log('Hint received:', data);
            this.currentHint = data.hint;
            this.displayHint(data.hint, data.hint_type);
        });

        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showStatus('Connection lost. Trying to reconnect...');
        });
    }

    setupEventListeners() {
        // Prediction slider
        document.getElementById('predictionSlider').addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('predictionValue').textContent = value;
            this.updatePredictionButtons(parseInt(value));
        });

        // Prediction buttons
        document.querySelectorAll('.prediction-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const value = parseInt(e.target.dataset.value);
                document.getElementById('predictionSlider').value = value;
                document.getElementById('predictionValue').textContent = value;
                this.updatePredictionButtons(value);
            });
        });

        // Confirm prediction
        document.getElementById('confirmPrediction').addEventListener('click', () => {
            this.makePrediction();
        });

        // Next round button
        document.getElementById('nextRoundBtn').addEventListener('click', () => {
            this.continueGame();
        });

        // Game over buttons
        document.getElementById('newGameBtn').addEventListener('click', () => {
            window.location.href = '/';
        });

        document.getElementById('backToMenuBtn').addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    
    setupAIControls() {
        // Game AI intelligence slider
        const gameAiSlider = document.getElementById('gameAiSlider');
        const gameAiValue = document.getElementById('gameAiValue');
        
        if (gameAiSlider && gameAiValue) {
            gameAiSlider.addEventListener('input', (e) => {
                const newLevel = parseInt(e.target.value);
                gameAiValue.textContent = newLevel;
                this.updateAIIntelligence(newLevel);
            });
        }
        
        // Hint button
        const hintBtn = document.getElementById('hintBtn');
        if (hintBtn) {
            hintBtn.addEventListener('click', () => {
                this.requestHint();
            });
        }
        
        // Hint toggle button
        const toggleHint = document.getElementById('toggleHint');
        if (toggleHint) {
            toggleHint.addEventListener('click', () => {
                this.toggleHintSection();
            });
        }
        
        // Refresh hint button
        const refreshHint = document.getElementById('refreshHint');
        if (refreshHint) {
            refreshHint.addEventListener('click', () => {
                this.requestHint();
            });
        }
        
        // Hide hint button
        const hideHint = document.getElementById('hideHint');
        if (hideHint) {
            hideHint.addEventListener('click', () => {
                this.hideHintSection();
            });
        }
    }

    joinGame() {
        this.socket.emit('join_game', {
            game_id: this.gameId
        });
    }

    updateGameState(gameState) {
        this.gameState = gameState;
        
        // Find human player index
        this.humanPlayerIndex = gameState.players.findIndex(p => p.is_human);
        
        // Update UI elements
        this.updateGameHeader();
        this.updatePlayersArea();
        this.updateTrickArea();
        this.updatePlayerHand();
        this.updateTrumpInfo();
    }

    updateGameHeader() {
        document.getElementById('gameIdDisplay').textContent = this.gameId;
        document.getElementById('currentRound').textContent = this.gameState.current_round;
        document.getElementById('maxRounds').textContent = this.gameState.max_rounds;
    }

    updateTrumpInfo() {
        const trumpCard = document.getElementById('trumpCard');
        const trumpSuit = document.getElementById('trumpSuit');
        
        if (this.gameState.trump_suit) {
            const suitSymbol = this.getSuitSymbol(this.gameState.trump_suit);
            const suitColor = (this.gameState.trump_suit === 'hearts' || this.gameState.trump_suit === 'diamonds') ? '#e53e3e' : '#2d3748';
            trumpSuit.innerHTML = `<span style="color: ${suitColor};">${suitSymbol}</span>`;
            trumpSuit.className = `trump-suit ${this.gameState.trump_suit}`;
            trumpCard.classList.remove('hidden');
        } else {
            trumpCard.classList.add('hidden');
        }
    }

    updatePlayersArea() {
        const playersArea = document.getElementById('playersArea');
        playersArea.innerHTML = '';

        this.gameState.players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-info';
            
            if (index === this.gameState.current_player && this.gameState.phase === 'playing') {
                playerDiv.classList.add('current-player');
            }
            
            if (player.is_human) {
                playerDiv.classList.add('human-player');
            }

            const predictionText = player.predicted_tricks !== null ? 
                `${player.predicted_tricks}` : '?';
            
            playerDiv.innerHTML = `
                <div class="player-name">${player.name}</div>
                <div class="player-stats">
                    <div class="stat">
                        <div class="stat-label">Cards</div>
                        <div class="stat-value">${player.hand_size}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Predicted</div>
                        <div class="stat-value">${predictionText}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Won</div>
                        <div class="stat-value">${player.tricks_won}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Score</div>
                        <div class="stat-value">${player.score}</div>
                    </div>
                </div>
            `;

            playersArea.appendChild(playerDiv);
        });
    }

    updateTrickArea() {
        const trickCards = document.getElementById('trickCards');
        trickCards.innerHTML = '';

        this.gameState.current_trick.cards.forEach(cardPlay => {
            const cardDiv = document.createElement('div');
            cardDiv.className = 'trick-card';
            
            cardDiv.innerHTML = `
                <div class="trick-card-display">
                    <span class="card-rank">${this.getCardRankDisplay(cardPlay.card.rank)}</span>
                    <span class="card-suit ${cardPlay.card.suit}">${this.getSuitSymbol(cardPlay.card.suit)}</span>
                </div>
                <div class="trick-card-player">${cardPlay.player_name}</div>
            `;

            trickCards.appendChild(cardDiv);
        });

        // Update lead suit info
        const leadSuit = document.getElementById('leadSuit');
        if (this.gameState.lead_suit) {
            leadSuit.textContent = `Lead: ${this.getSuitSymbol(this.gameState.lead_suit)}`;
        } else {
            leadSuit.textContent = '';
        }
    }

    updatePlayerHand() {
        const playerHand = document.getElementById('playerHand');
        const humanPlayer = this.gameState.players[this.humanPlayerIndex];
        
        // Update hand size info
        document.getElementById('playerName').textContent = humanPlayer.name;
        document.getElementById('handSize').textContent = `${humanPlayer.hand.length} cards`;
        
        playerHand.innerHTML = '';

        humanPlayer.hand.forEach((card, index) => {
            const cardDiv = document.createElement('div');
            cardDiv.className = 'card';
            
            // Check if card is playable
            if (this.gameState.phase === 'playing' && 
                this.gameState.current_player === this.humanPlayerIndex) {
                if (this.isCardPlayable(card)) {
                    cardDiv.classList.add('playable');
                } else {
                    cardDiv.classList.add('unplayable');
                }
            }

            cardDiv.innerHTML = `
                <div class="card-rank">${this.getCardRankDisplay(card.rank)}</div>
                <div class="card-suit ${card.suit}">${this.getSuitSymbol(card.suit)}</div>
            `;

            cardDiv.addEventListener('click', () => {
                if (cardDiv.classList.contains('playable')) {
                    this.playCard(index);
                }
            });

            playerHand.appendChild(cardDiv);
        });
    }

    isCardPlayable(card) {
        // If it's not the player's turn, no cards are playable
        if (this.gameState.current_player !== this.humanPlayerIndex) {
            return false;
        }

        // If leading the trick, any card is playable
        if (this.gameState.current_trick.cards.length === 0) {
            return true;
        }

        // Must follow suit if possible
        if (this.gameState.lead_suit) {
            const humanPlayer = this.gameState.players[this.humanPlayerIndex];
            const hasLeadSuit = humanPlayer.hand.some(c => c.suit === this.gameState.lead_suit);
            
            if (hasLeadSuit && card.suit !== this.gameState.lead_suit) {
                return false;
            }
        }

        return true;
    }

    showBiddingModal() {
        const cardsThisRound = document.getElementById('cardsThisRound');
        const trumpSuitDisplay = document.getElementById('trumpSuitDisplay');
        const predictionSlider = document.getElementById('predictionSlider');
        const biddingCards = document.getElementById('biddingCards');
        
        cardsThisRound.textContent = this.gameState.cards_per_round;
        
        if (this.gameState.trump_suit) {
            const suitSymbol = this.getSuitSymbol(this.gameState.trump_suit);
            const suitColor = (this.gameState.trump_suit === 'hearts' || this.gameState.trump_suit === 'diamonds') ? 'red' : 'black';
            trumpSuitDisplay.innerHTML = `<span style="color: ${suitColor};">${suitSymbol}</span> ${this.gameState.trump_suit}`;
        } else {
            trumpSuitDisplay.textContent = 'None';
        }

        // Show player's cards in the modal
        const humanPlayer = this.gameState.players[this.humanPlayerIndex];
        biddingCards.innerHTML = '';
        
        humanPlayer.hand.forEach(card => {
            const cardDiv = document.createElement('div');
            cardDiv.className = 'bidding-card';
            
            cardDiv.innerHTML = `
                <div class="bidding-card-rank">${this.getCardRankDisplay(card.rank)}</div>
                <div class="bidding-card-suit ${card.suit}">${this.getSuitSymbol(card.suit)}</div>
            `;
            
            biddingCards.appendChild(cardDiv);
        });

        // Set slider max
        predictionSlider.max = this.gameState.cards_per_round;
        predictionSlider.value = 0;
        document.getElementById('predictionValue').textContent = '0';
        
        // Update prediction buttons
        this.setupPredictionButtons();
        this.updatePredictionButtons(0);

        // Reset hint section to hidden state
        this.hideHintSection();

        document.getElementById('biddingModal').classList.remove('hidden');
    }

    hideBiddingModal() {
        document.getElementById('biddingModal').classList.add('hidden');
    }

    setupPredictionButtons() {
        const buttonsContainer = document.querySelector('.prediction-buttons');
        buttonsContainer.innerHTML = '';

        for (let i = 0; i <= Math.min(this.gameState.cards_per_round, 5); i++) {
            const btn = document.createElement('button');
            btn.className = 'prediction-btn';
            btn.dataset.value = i;
            btn.textContent = i;
            
            btn.addEventListener('click', (e) => {
                const value = parseInt(e.target.dataset.value);
                document.getElementById('predictionSlider').value = value;
                document.getElementById('predictionValue').textContent = value;
                this.updatePredictionButtons(value);
            });

            buttonsContainer.appendChild(btn);
        }
    }

    updatePredictionButtons(selectedValue) {
        document.querySelectorAll('.prediction-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.value) === selectedValue) {
                btn.classList.add('active');
            }
        });
    }

    makePrediction() {
        const prediction = parseInt(document.getElementById('predictionSlider').value);
        
        console.log('Making prediction:', prediction);
        this.showStatus('Making your prediction...');
        
        // Disable the confirm button to prevent double-clicks
        const confirmBtn = document.getElementById('confirmPrediction');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';
        
        this.socket.emit('make_prediction', {
            game_id: this.gameId,
            player_index: this.humanPlayerIndex,
            prediction: prediction
        });
        
        // Re-enable button after a timeout as fallback
        setTimeout(() => {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Prediction';
        }, 3000);
    }

    playCard(cardIndex) {
        this.socket.emit('play_card', {
            game_id: this.gameId,
            player_index: this.humanPlayerIndex,
            card_index: cardIndex
        });
    }

    showRoundResults() {
        const resultsTable = document.getElementById('resultsTable');
        resultsTable.innerHTML = '';

        this.gameState.players.forEach(player => {
            const resultRow = document.createElement('div');
            resultRow.className = 'results-row';
            
            if (player.predicted_tricks === player.tricks_won) {
                resultRow.classList.add('correct-prediction');
            } else {
                resultRow.classList.add('wrong-prediction');
            }

            const roundScore = player.predicted_tricks === player.tricks_won ? 
                (10 + 2 * player.tricks_won) : 
                -(Math.abs(player.predicted_tricks - player.tricks_won) * 2);

            resultRow.innerHTML = `
                <div class="result-player">${player.name}</div>
                <div class="result-stats">
                    <div class="result-stat">
                        <div class="result-stat-label">Predicted</div>
                        <div class="result-stat-value">${player.predicted_tricks}</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">Won</div>
                        <div class="result-stat-value">${player.tricks_won}</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">Round Score</div>
                        <div class="result-stat-value">${roundScore > 0 ? '+' : ''}${roundScore}</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">Total Score</div>
                        <div class="result-stat-value">${player.score}</div>
                    </div>
                </div>
            `;

            resultsTable.appendChild(resultRow);
        });

        document.getElementById('roundResultsModal').classList.remove('hidden');
    }

    hideRoundResults() {
        document.getElementById('roundResultsModal').classList.add('hidden');
    }

    continueGame() {
        this.socket.emit('continue_game', {
            game_id: this.gameId
        });
    }

    showGameOver() {
        const winner = this.gameState.players.reduce((prev, current) => 
            (prev.score > current.score) ? prev : current
        );

        const winnerAnnouncement = document.getElementById('winnerAnnouncement');
        winnerAnnouncement.innerHTML = `
            <h3><i class="fas fa-crown"></i> ${winner.name} Wins!</h3>
            <p>Final Score: ${winner.score} points</p>
        `;

        const finalScores = document.getElementById('finalScores');
        finalScores.innerHTML = '';

        // Sort players by score
        const sortedPlayers = [...this.gameState.players].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((player, index) => {
            const scoreRow = document.createElement('div');
            scoreRow.className = 'score-row';
            
            if (index === 0) {
                scoreRow.classList.add('winner');
            }

            scoreRow.innerHTML = `
                <span>${index + 1}. ${player.name}</span>
                <span>${player.score} points</span>
            `;

            finalScores.appendChild(scoreRow);
        });

        document.getElementById('gameOverModal').classList.remove('hidden');
    }

    showStatus(message) {
        document.getElementById('statusMessage').textContent = message;
    }

    getSuitSymbol(suit) {
        const symbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return symbols[suit] || suit;
    }

    getCardRankDisplay(rank) {
        if (rank === 1) return 'A';
        if (rank === 11) return 'J';
        if (rank === 12) return 'Q';
        if (rank === 13) return 'K';
        return rank.toString();
    }
    
    updateAIIntelligence(level) {
        this.aiIntelligence = level;
        this.socket.emit('set_ai_intelligence', {
            game_id: this.gameId,
            intelligence_level: level
        });
    }
    
    requestHint() {
        if (!this.gameState) return;
        
        let hintType = 'prediction';
        if (this.gameState.phase === 'playing' && this.gameState.current_player === this.humanPlayerIndex) {
            hintType = 'card';
        }
        
        this.socket.emit('get_hint', {
            game_id: this.gameId,
            hint_type: hintType
        });
    }
    
    toggleHintSection() {
        const hintSection = document.getElementById('hintSection');
        const toggleBtn = document.getElementById('toggleHint');
        
        if (hintSection && toggleBtn) {
            if (hintSection.classList.contains('hidden')) {
                this.showHintSection();
                this.requestHint(); // Auto-request hint when showing
            } else {
                this.hideHintSection();
            }
        }
    }
    
    showHintSection() {
        const hintSection = document.getElementById('hintSection');
        const toggleBtn = document.getElementById('toggleHint');
        
        if (hintSection && toggleBtn) {
            hintSection.classList.remove('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Hide AI Hint';
        }
    }
    
    hideHintSection() {
        const hintSection = document.getElementById('hintSection');
        const toggleBtn = document.getElementById('toggleHint');
        
        if (hintSection && toggleBtn) {
            hintSection.classList.add('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Show AI Hint';
        }
    }
    
    displayHint(hint, hintType) {
        const hintSection = document.getElementById('hintSection');
        const hintDetails = document.getElementById('hintDetails');
        
        if (!hintDetails || hint.error) {
            if (hintDetails) {
                hintDetails.innerHTML = '<div class="hint-error">No hint available right now.</div>';
            }
            return;
        }
        
        if (hintType === 'prediction') {
            this.displayPredictionHint(hint);
        } else if (hintType === 'card') {
            this.displayCardHint(hint);
        }
        
        // Show the hint section if user has requested it
        if (hintSection && !hintSection.classList.contains('hidden')) {
            // Already visible, just update content
        }
    }
    
    displayPredictionHint(hint) {
        const hintDetails = document.getElementById('hintDetails');
        
        const analysisHtml = hint.trump_cards !== undefined ? `
            <div class="hint-analysis">
                <div class="hint-stat">
                    <div class="hint-stat-label">Trump</div>
                    <div class="hint-stat-value">${hint.trump_cards}</div>
                </div>
                <div class="hint-stat">
                    <div class="hint-stat-label">High Cards</div>
                    <div class="hint-stat-value">${hint.high_cards}</div>
                </div>
                <div class="hint-stat">
                    <div class="hint-stat-label">HCP</div>
                    <div class="hint-stat-value">${hint.hcp}</div>
                </div>
            </div>
        ` : '';
        
        hintDetails.innerHTML = `
            <div class="hint-prediction">
                AI suggests: <span class="hint-value">${hint.prediction}</span> tricks
            </div>
            ${analysisHtml}
            <div class="hint-reasoning">
                ${hint.reasoning}
            </div>
        `;
    }
    
    displayCardHint(hint) {
        const hintDetails = document.getElementById('hintDetails');
        
        if (hint.card) {
            const cardDisplay = `${this.getCardRankDisplay(hint.card.rank)}${this.getSuitSymbol(hint.card.suit)}`;
            hintDetails.innerHTML = `
                <div class="hint-prediction">
                    AI suggests: <span class="hint-value">${cardDisplay}</span>
                </div>
                <div class="hint-reasoning">
                    ${hint.reasoning}
                </div>
            `;
        } else {
            hintDetails.innerHTML = '<div class="hint-error">No card suggestion available.</div>';
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Start the game automatically and show bidding modal
    const gameUI = new KachuGameUI(GAME_ID);
    
    // Auto-start the first round
    setTimeout(() => {
        gameUI.socket.emit('start_round', {
            game_id: GAME_ID
        });
    }, 1000);
});
