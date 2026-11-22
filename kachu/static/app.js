// Main app.js for the welcome screen
class KachuApp {
    constructor() {
        this.socket = io();
        this.aiIntelligence = 5;
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setupAIControls();
    }

    setupEventListeners() {
        // Start new game button
        document.getElementById('startGameBtn').addEventListener('click', () => {
            this.startNewGame();
        });

        // Join game button
        document.getElementById('joinGameBtn').addEventListener('click', () => {
            this.joinGame();
        });

        // Error OK button
        document.getElementById('errorOkBtn').addEventListener('click', () => {
            this.hideError();
        });

        // Enter key handlers
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.startNewGame();
            }
        });

        document.getElementById('gameId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('game_created', (data) => {
            console.log('Game created:', data);
            this.redirectToGame(data.game_id);
        });

        this.socket.on('game_joined', (data) => {
            console.log('Game joined:', data);
            this.redirectToGame(data.game_id);
        });

        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            this.showError(data.message);
            this.hideLoading();
        });
    }

    setupAIControls() {
        const aiSlider = document.getElementById('aiIntelligence');
        const aiValue = document.getElementById('aiValue');
        const aiDescription = document.getElementById('aiDescription');
        const aiLevelBadge = document.getElementById('aiLevelBadge');
        const aiFeatures = document.getElementById('aiFeatures');
        
        const descriptions = {
            0: "Basic AI - Random plays with minimal strategy",
            1: "Novice AI - Simple card value recognition",
            2: "Beginner AI - Basic suit following and trump awareness",
            3: "Casual AI - Improved prediction with basic counting",
            4: "Intermediate AI - High-card points and length evaluation",
            5: "Balanced AI - Uses basic strategy with some card counting",
            6: "Advanced AI - Strategic play with distribution analysis",
            7: "Expert AI - Target-based play with opponent modeling",
            8: "Master AI - Lookahead with Monte Carlo simulation",
            9: "Grandmaster AI - Deep analysis with probabilistic reasoning",
            10: "Perfect AI - Maximum intelligence with optimal play"
        };
        
        const badges = {
            0: "Random", 1: "Novice", 2: "Beginner", 3: "Casual", 4: "Intermediate",
            5: "Balanced", 6: "Advanced", 7: "Expert", 8: "Master", 9: "Grandmaster", 10: "Perfect"
        };
        
        const updateAIFeatures = (level) => {
            const features = aiFeatures.querySelectorAll('.ai-feature');
            features[0].classList.toggle('active', level >= 1); // Basic Strategy
            features[1].classList.toggle('active', level >= 3); // Card Counting
            features[2].classList.toggle('active', level >= 8); // Monte Carlo
        };
        
        aiSlider.addEventListener('input', (e) => {
            this.aiIntelligence = parseInt(e.target.value);
            aiValue.textContent = this.aiIntelligence;
            aiDescription.textContent = descriptions[this.aiIntelligence];
            aiLevelBadge.textContent = badges[this.aiIntelligence];
            updateAIFeatures(this.aiIntelligence);
        });
        
        // Initialize
        updateAIFeatures(this.aiIntelligence);
    }

    startNewGame() {
        const playerName = document.getElementById('playerName').value.trim() || 'You';
        const numPlayers = parseInt(document.getElementById('numPlayers').value);

        if (playerName.length === 0) {
            this.showError('Please enter your name');
            return;
        }

        if (numPlayers < 2 || numPlayers > 8) {
            this.showError('Number of players must be between 2 and 8');
            return;
        }

        this.showLoading();

        this.socket.emit('create_game', {
            player_name: playerName,
            num_players: numPlayers,
            ai_intelligence: this.aiIntelligence
        });
    }

    joinGame() {
        const gameId = document.getElementById('gameId').value.trim();

        if (gameId.length === 0) {
            this.showError('Please enter a game ID');
            return;
        }

        this.showLoading();

        this.socket.emit('join_game', {
            game_id: gameId
        });
    }

    redirectToGame(gameId) {
        window.location.href = `/game/${gameId}`;
    }

    showLoading() {
        document.getElementById('welcomeScreen').classList.add('hidden');
        document.getElementById('loadingScreen').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('welcomeScreen').classList.remove('hidden');
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').classList.remove('hidden');
    }

    hideError() {
        document.getElementById('errorMessage').classList.add('hidden');
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new KachuApp();
});
