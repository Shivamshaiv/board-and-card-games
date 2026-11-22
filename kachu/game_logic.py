"""
Kachu (Judgment) Card Game Logic
A trick-taking card game where players predict how many tricks they'll win.
"""

import random
from enum import Enum
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

class Suit(Enum):
    HEARTS = "hearts"
    DIAMONDS = "diamonds"
    CLUBS = "clubs"
    SPADES = "spades"

class Card:
    def __init__(self, suit: Suit, rank: int):
        self.suit = suit
        self.rank = rank  # 1=Ace, 2-10=number cards, 11=Jack, 12=Queen, 13=King
    
    def __str__(self):
        rank_names = {1: "A", 11: "J", 12: "Q", 13: "K"}
        rank_str = rank_names.get(self.rank, str(self.rank))
        return f"{rank_str}{self.suit.value[0].upper()}"
    
    def __repr__(self):
        return str(self)
    
    def to_dict(self):
        return {
            "suit": self.suit.value,
            "rank": self.rank,
            "display": str(self)
        }

@dataclass
class Player:
    name: str
    hand: List[Card]
    predicted_tricks: Optional[int] = None
    tricks_won: int = 0
    score: int = 0
    is_human: bool = False
    
    def __post_init__(self):
        if not self.hand:
            self.hand = []

class Trick:
    def __init__(self):
        self.cards: List[Tuple[int, Card]] = []  # (player_index, card)
        self.winner: Optional[int] = None
        
    def add_card(self, player_index: int, card: Card):
        self.cards.append((player_index, card))
    
    def determine_winner(self, trump_suit: Optional[Suit], lead_suit: Suit) -> int:
        """Determine the winner of the trick"""
        if not self.cards:
            return -1
            
        winning_card = None
        winner_index = -1
        
        # First, check for trump cards
        trump_cards = [(idx, card) for idx, card in self.cards if card.suit == trump_suit]
        if trump_cards and trump_suit is not None:
            # Highest trump wins
            winning_card = max(trump_cards, key=lambda x: x[1].rank)
            winner_index = winning_card[0]
        else:
            # No trump cards, highest card of lead suit wins
            lead_cards = [(idx, card) for idx, card in self.cards if card.suit == lead_suit]
            if lead_cards:
                winning_card = max(lead_cards, key=lambda x: x[1].rank)
                winner_index = winning_card[0]
        
        self.winner = winner_index
        return winner_index

class KachuGame:
    def __init__(self, num_players: int, human_player_name: str = "You", ai_intelligence: int = 5):
        self.num_players = num_players
        self.players: List[Player] = []
        self.current_round = 1
        self.max_rounds = 13  # Standard 52-card deck
        self.current_player = 0
        self.dealer = 0
        self.trump_suit: Optional[Suit] = None
        self.current_trick = Trick()
        self.completed_tricks: List[Trick] = []
        self.phase = "setup"  # setup, bidding, playing, round_end, game_end
        self.cards_per_round = 1
        self.lead_suit: Optional[Suit] = None
        self.ai_intelligence = ai_intelligence
        self.ai_players: Dict[int, 'AIIntelligence'] = {}
        
        # Initialize players
        for i in range(num_players):
            if i == 0:  # First player is human
                player = Player(name=human_player_name, hand=[], is_human=True)
            else:
                player = Player(name=f"Player {i+1}", hand=[])
                # Initialize AI for this player
                from ai_system import AIIntelligence
                self.ai_players[i] = AIIntelligence(i, ai_intelligence)
            self.players.append(player)
    
    def create_deck(self) -> List[Card]:
        """Create a standard 52-card deck"""
        deck = []
        for suit in Suit:
            for rank in range(1, 14):  # Ace through King
                deck.append(Card(suit, rank))
        return deck
    
    def deal_cards(self):
        """Deal cards for the current round"""
        deck = self.create_deck()
        random.shuffle(deck)
        
        # Calculate cards per round based on current round
        if self.current_round <= 13:
            self.cards_per_round = self.current_round
        else:
            # Decreasing phase
            self.cards_per_round = 26 - self.current_round
        
        # Clear previous hands
        for player in self.players:
            player.hand = []
            player.predicted_tricks = None
            player.tricks_won = 0
        
        # Deal cards
        card_index = 0
        for _ in range(self.cards_per_round):
            for player in self.players:
                if card_index < len(deck):
                    player.hand.append(deck[card_index])
                    card_index += 1
        
        # Determine trump suit from next card (if available)
        if card_index < len(deck):
            trump_card = deck[card_index]
            self.trump_suit = trump_card.suit
        else:
            self.trump_suit = None
        
        # Sort hands by suit and rank
        for player in self.players:
            player.hand.sort(key=lambda card: (card.suit.value, card.rank))
    
    def start_new_round(self):
        """Start a new round"""
        self.deal_cards()
        self.current_trick = Trick()
        self.completed_tricks = []
        self.current_player = (self.dealer + 1) % self.num_players
        self.phase = "bidding"
        self.lead_suit = None
        
        # Reset AI players for new round
        for ai_player in self.ai_players.values():
            ai_player.reset_for_new_round(self)
    
    def make_prediction(self, player_index: int, prediction: int) -> bool:
        """Player makes a prediction for tricks they'll win"""
        if self.phase != "bidding":
            return False
        
        if 0 <= prediction <= self.cards_per_round:
            self.players[player_index].predicted_tricks = prediction
            return True
        return False
    
    def all_predictions_made(self) -> bool:
        """Check if all players have made their predictions"""
        return all(player.predicted_tricks is not None for player in self.players)
    
    def get_ai_prediction(self, player_index: int) -> int:
        """Get AI prediction using the new AI system"""
        if player_index in self.ai_players:
            ai_player = self.ai_players[player_index]
            player = self.players[player_index]
            return ai_player.make_prediction(self, player.hand)
        
        # Fallback to basic prediction if AI not initialized
        return self._basic_ai_prediction(player_index)
    
    def _basic_ai_prediction(self, player_index: int) -> int:
        """Fallback basic AI prediction"""
        player = self.players[player_index]
        hand_strength = 0
        
        for card in player.hand:
            if card.suit == self.trump_suit:
                hand_strength += 2
                if card.rank >= 10:
                    hand_strength += 1
            elif card.rank >= 11:
                hand_strength += 1
            elif card.rank >= 10:
                hand_strength += 0.5
        
        base_prediction = min(self.cards_per_round, max(0, int(hand_strength * 0.6)))
        variation = random.randint(-1, 1)
        return max(0, min(self.cards_per_round, base_prediction + variation))
    
    def play_card(self, player_index: int, card_index: int) -> bool:
        """Player plays a card"""
        if self.phase != "playing":
            return False
        
        if player_index != self.current_player:
            return False
        
        player = self.players[player_index]
        if 0 <= card_index < len(player.hand):
            card = player.hand[card_index]
            
            # Check if card is valid to play
            if self.is_valid_play(player, card):
                # Remove card from hand and add to trick
                player.hand.pop(card_index)
                self.current_trick.add_card(player_index, card)
                
                # Update AI beliefs
                for ai_player in self.ai_players.values():
                    ai_player.update_beliefs(self, player_index, card)
                
                # Set lead suit if this is the first card
                if len(self.current_trick.cards) == 1:
                    self.lead_suit = card.suit
                
                # Move to next player
                self.current_player = (self.current_player + 1) % self.num_players
                
                # Check if trick is complete
                if len(self.current_trick.cards) == self.num_players:
                    self.complete_trick()
                
                return True
        
        return False
    
    def is_valid_play(self, player: Player, card: Card) -> bool:
        """Check if a card play is valid"""
        # If leading the trick, any card is valid
        if len(self.current_trick.cards) == 0:
            return True
        
        # Must follow suit if possible
        if self.lead_suit:
            has_lead_suit = any(c.suit == self.lead_suit for c in player.hand)
            if has_lead_suit and card.suit != self.lead_suit:
                return False
        
        return True
    
    def get_ai_card_choice(self, player_index: int) -> int:
        """Get AI's card choice using the new AI system"""
        if player_index in self.ai_players:
            ai_player = self.ai_players[player_index]
            player = self.players[player_index]
            return ai_player.choose_card(self, player.hand)
        
        # Fallback to basic card choice if AI not initialized
        return self._basic_ai_card_choice(player_index)
    
    def _basic_ai_card_choice(self, player_index: int) -> int:
        """Fallback basic AI card choice"""
        player = self.players[player_index]
        valid_cards = []
        
        for i, card in enumerate(player.hand):
            if self.is_valid_play(player, card):
                valid_cards.append((i, card))
        
        if not valid_cards:
            return 0
        
        if len(self.current_trick.cards) == 0:
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[len(valid_cards) // 2][0]
        else:
            trump_cards = [(i, c) for i, c in valid_cards if c.suit == self.trump_suit]
            if trump_cards:
                trump_cards.sort(key=lambda x: x[1].rank, reverse=True)
                return trump_cards[0][0]
            
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[0][0]
    
    def set_ai_intelligence(self, intelligence_level: int):
        """Update AI intelligence level for all AI players"""
        self.ai_intelligence = max(0, min(10, intelligence_level))
        
        # Update existing AI players
        for player_index, ai_player in self.ai_players.items():
            ai_player.intelligence_level = self.ai_intelligence
        
        # Reinitialize AI players if needed
        from ai_system import AIIntelligence
        for i in range(1, self.num_players):  # Skip human player (index 0)
            self.ai_players[i] = AIIntelligence(i, self.ai_intelligence)
    
    def get_hint_for_human(self, hint_type: str = "prediction") -> Dict:
        """Get hint for human player about what AI would do"""
        from ai_system import HintSystem
        
        if hint_type == "prediction" and self.phase == "bidding":
            return HintSystem.get_prediction_hint(self, 0, self.ai_intelligence)
        elif hint_type == "card" and self.phase == "playing" and self.current_player == 0:
            return HintSystem.get_card_hint(self, 0, self.ai_intelligence)
        
        return {"error": "No hint available for current game state"}
    
    def complete_trick(self):
        """Complete the current trick and determine winner"""
        if self.lead_suit:
            winner = self.current_trick.determine_winner(self.trump_suit, self.lead_suit)
            self.players[winner].tricks_won += 1
            
            # Add to completed tricks
            self.completed_tricks.append(self.current_trick)
            
            # Start new trick with winner leading
            self.current_trick = Trick()
            self.current_player = winner
            self.lead_suit = None
            
            # Check if round is complete
            if all(len(player.hand) == 0 for player in self.players):
                self.complete_round()
    
    def complete_round(self):
        """Complete the current round and calculate scores"""
        for player in self.players:
            if player.predicted_tricks == player.tricks_won:
                # Exact prediction: 10 + 2 * tricks
                player.score += 10 + (2 * player.tricks_won)
            else:
                # Wrong prediction: lose points
                difference = abs(player.predicted_tricks - player.tricks_won)
                player.score -= difference * 2
        
        # Move to next round
        self.current_round += 1
        self.dealer = (self.dealer + 1) % self.num_players
        
        if self.current_round > self.max_rounds:
            self.phase = "game_end"
        else:
            self.phase = "round_end"
    
    def start_playing_phase(self):
        """Start the playing phase of the round"""
        self.phase = "playing"
        self.current_player = (self.dealer + 1) % self.num_players
    
    def get_game_state(self) -> Dict:
        """Get current game state for UI"""
        return {
            "phase": self.phase,
            "current_round": self.current_round,
            "max_rounds": self.max_rounds,
            "cards_per_round": self.cards_per_round,
            "trump_suit": self.trump_suit.value if self.trump_suit else None,
            "current_player": self.current_player,
            "dealer": self.dealer,
            "players": [
                {
                    "name": player.name,
                    "hand": [card.to_dict() for card in player.hand],
                    "predicted_tricks": player.predicted_tricks,
                    "tricks_won": player.tricks_won,
                    "score": player.score,
                    "is_human": player.is_human,
                    "hand_size": len(player.hand)
                }
                for player in self.players
            ],
            "current_trick": {
                "cards": [
                    {
                        "player_index": idx,
                        "card": card.to_dict(),
                        "player_name": self.players[idx].name
                    }
                    for idx, card in self.current_trick.cards
                ]
            },
            "lead_suit": self.lead_suit.value if self.lead_suit else None
        }
    
    def get_winner(self) -> Optional[Player]:
        """Get the game winner"""
        if self.phase == "game_end":
            return max(self.players, key=lambda p: p.score)
        return None
