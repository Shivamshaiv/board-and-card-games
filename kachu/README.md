# Kachu (Judgment) Card Game Emulator

A beautiful and intuitive web-based implementation of the classic Kachu (also known as Judgment) card game, where players predict exactly how many tricks they'll win each round.

## Features

🎮 **Complete Game Implementation**
- Full Kachu/Judgment game logic with proper scoring
- Support for 2-8 players
- Beautiful, responsive web interface
- Real-time multiplayer gameplay using WebSockets

🤖 **Smart AI Players**
- Intelligent AI opponents that analyze their hands
- Realistic bidding and playing strategies
- Challenging gameplay for solo players

🎨 **Beautiful UI/UX**
- Modern, gradient-based design with smooth animations
- Intuitive card selection and bidding interface
- Real-time game state updates
- Mobile-responsive design

🃏 **Game Rules**
- Standard 52-card deck
- Trump suit determination each round
- Exact prediction scoring: 10 + 2×tricks if correct
- Penalty scoring: -2×difference if wrong
- No restrictions on predictions (variant rule)

## How to Play

1. **Setup**: Choose number of players (2-8) and enter your name
2. **Bidding**: Each round, predict exactly how many tricks you'll win
3. **Playing**: Play cards following suit when possible, trump cards win tricks
4. **Scoring**: Score points for exact predictions, lose points for being wrong
5. **Winning**: Highest total score after all rounds wins!

## Installation & Running

### Prerequisites
- Python 3.7+
- pip (Python package installer)

### Setup
1. Clone or download this repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Game
1. Start the server:
   ```bash
   python app.py
   ```

2. Open your web browser and go to:
   ```
   http://localhost:5000
   ```

3. Enter your name, select number of players, and start playing!

## Game Controls

### Bidding Phase
- Use the slider or click number buttons to select your prediction
- Click "Confirm Prediction" to submit your bid

### Playing Phase
- Click on cards in your hand to play them
- Green border indicates playable cards
- Red border indicates unplayable cards (must follow suit)

### Game Navigation
- View current scores and trick counts for all players
- See trump suit and lead suit information
- Track round progress and game state

## Technical Details

### Backend (Python/Flask)
- `game_logic.py`: Core game engine with complete Kachu rules
- `app.py`: Flask web server with WebSocket support
- Real-time multiplayer using Socket.IO

### Frontend (HTML/CSS/JavaScript)
- Modern, responsive web interface
- Real-time game state synchronization
- Beautiful animations and visual feedback
- Mobile-friendly design

### Game Features
- **No Prediction Restrictions**: Players can predict any number of tricks (variant rule)
- **Intelligent AI**: Computer players make strategic decisions based on hand strength
- **Complete Scoring**: Proper implementation of Kachu scoring rules
- **Full Game Flow**: Bidding, trick-taking, scoring, and multi-round gameplay

## Game Rules Explained

### Rounds
- Game consists of multiple rounds with varying numbers of cards
- Round 1: 1 card each, Round 2: 2 cards each, etc.
- Trump suit is determined by the next card after dealing

### Bidding
- Each player predicts exactly how many tricks they'll win
- No restrictions on total predictions (variant rule)
- Bidding order rotates each round

### Trick-Taking
- Players must follow the lead suit if possible
- Trump cards beat all non-trump cards
- Highest card of the lead suit wins if no trump is played
- Winner of trick leads the next trick

### Scoring
- **Exact Prediction**: 10 + (2 × tricks won)
- **Wrong Prediction**: -(2 × |predicted - actual|)
- Example: Predict 3, win 3 = +16 points
- Example: Predict 2, win 4 = -4 points

## Customization

The game can be easily customized by modifying:
- Number of rounds in `game_logic.py`
- Scoring rules in the `complete_round()` method
- AI difficulty in the `get_ai_prediction()` and `get_ai_card_choice()` methods
- UI styling in `static/style.css`

## Browser Compatibility

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

This project is open source and available under the MIT License.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the game!

---

Enjoy playing Kachu! 🃏♠️♥️♦️♣️
