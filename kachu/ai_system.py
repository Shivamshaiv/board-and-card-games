"""
Enhanced AI System for Kachu (Judgment) Card Game
Implements multiple intelligence levels from basic to advanced Monte Carlo simulation
"""

import random
import math
from enum import Enum
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field
from collections import defaultdict
import copy

from game_logic import Suit, Card, Player, KachuGame


@dataclass
class AIBeliefs:
    """Tracks what the AI knows about the game state"""
    seen_cards: Set[Tuple[Suit, int]] = field(default_factory=set)
    remaining_ranks_by_suit: Dict[Suit, List[int]] = field(default_factory=dict)
    void_prob_by_player_suit: List[Dict[Suit, float]] = field(default_factory=list)
    tricks_needed: int = 0
    trump_suit: Optional[Suit] = None
    cards_played_this_trick: List[Tuple[int, Card]] = field(default_factory=list)
    round_history: List[Dict] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.remaining_ranks_by_suit:
            for suit in Suit:
                self.remaining_ranks_by_suit[suit] = list(range(1, 14))


class AIIntelligence:
    """AI Intelligence system with configurable difficulty levels"""
    
    def __init__(self, player_index: int, intelligence_level: int = 5):
        self.player_index = player_index
        self.intelligence_level = max(0, min(10, intelligence_level))  # Clamp to 0-10
        self.beliefs = AIBeliefs()
        self.game_history = []
        
    def reset_for_new_round(self, game: KachuGame):
        """Reset AI state for a new round"""
        self.beliefs = AIBeliefs()
        self.beliefs.trump_suit = game.trump_suit
        # Initialize void probabilities for all players
        self.beliefs.void_prob_by_player_suit = [
            {suit: 0.0 for suit in Suit} for _ in range(game.num_players)
        ]
        # Initialize remaining ranks
        for suit in Suit:
            self.beliefs.remaining_ranks_by_suit[suit] = list(range(1, 14))
        
    def update_beliefs(self, game: KachuGame, player_idx: int, card: Card):
        """Update AI beliefs when a card is played"""
        self.beliefs.seen_cards.add((card.suit, card.rank))
        
        # Remove from remaining cards
        if card.rank in self.beliefs.remaining_ranks_by_suit[card.suit]:
            self.beliefs.remaining_ranks_by_suit[card.suit].remove(card.rank)
        
        # Update void probabilities
        if self.intelligence_level >= 3:
            self._update_void_probabilities(game, player_idx, card)
    
    def _update_void_probabilities(self, game: KachuGame, player_idx: int, card: Card):
        """Update probability estimates of players being void in suits"""
        # Ensure we have enough entries for all players
        while len(self.beliefs.void_prob_by_player_suit) <= player_idx:
            self.beliefs.void_prob_by_player_suit.append({suit: 0.0 for suit in Suit})
        
        # If player played off-suit when they could follow, they're void in lead suit
        if (len(game.current_trick.cards) > 1 and 
            game.lead_suit and 
            card.suit != game.lead_suit and 
            card.suit != game.trump_suit):
            self.beliefs.void_prob_by_player_suit[player_idx][game.lead_suit] = 1.0
    
    def get_hcp_value(self, card: Card, trump_suit: Optional[Suit]) -> float:
        """Calculate high card points for a card"""
        base_hcp = {1: 4, 13: 3, 12: 2, 11: 1}.get(card.rank, 0)
        
        # Trump bonus
        if card.suit == trump_suit and self.intelligence_level >= 4:
            return base_hcp * 1.25
        return base_hcp
    
    def get_length_points(self, hand: List[Card], suit: Suit, trump_suit: Optional[Suit]) -> float:
        """Calculate length points for a suit"""
        suit_cards = [c for c in hand if c.suit == suit]
        length = len(suit_cards)
        
        if length <= 3:
            return 0
        
        base_points = (length - 3) * 0.5
        
        # Trump length is more valuable
        if suit == trump_suit and self.intelligence_level >= 5:
            base_points *= 1.5
        
        return base_points
    
    def get_distribution_points(self, hand: List[Card], trump_suit: Optional[Suit]) -> float:
        """Calculate distribution points"""
        if self.intelligence_level < 6:
            return 0
        
        suit_counts = defaultdict(int)
        for card in hand:
            suit_counts[card.suit] += 1
        
        points = 0
        for suit, count in suit_counts.items():
            if suit != trump_suit:  # Don't count trump shortages
                if count == 1:  # Singleton
                    points += 0.5
                elif count == 0:  # Void
                    points += 1.0
        
        return points
    
    def make_prediction(self, game: KachuGame, hand: List[Card]) -> int:
        """Make a prediction based on intelligence level"""
        if self.intelligence_level == 0:
            return self._basic_prediction(game, hand)
        elif self.intelligence_level <= 3:
            return self._improved_prediction(game, hand)
        elif self.intelligence_level <= 6:
            return self._advanced_prediction(game, hand)
        else:
            return self._expert_prediction(game, hand)
    
    def _basic_prediction(self, game: KachuGame, hand: List[Card]) -> int:
        """Original basic prediction logic"""
        hand_strength = 0
        
        for card in hand:
            if card.suit == game.trump_suit:
                hand_strength += 2
                if card.rank >= 10:
                    hand_strength += 1
            elif card.rank >= 11:
                hand_strength += 1
            elif card.rank >= 10:
                hand_strength += 0.5
        
        base_prediction = min(game.cards_per_round, max(0, int(hand_strength * 0.6)))
        variation = random.randint(-1, 1)
        return max(0, min(game.cards_per_round, base_prediction + variation))
    
    def _improved_prediction(self, game: KachuGame, hand: List[Card]) -> int:
        """Improved prediction with basic HCP"""
        hcp = sum(self.get_hcp_value(card, game.trump_suit) for card in hand)
        trump_count = sum(1 for card in hand if card.suit == game.trump_suit)
        
        # Basic estimation
        estimated_tricks = (hcp * 0.25) + (trump_count * 0.3)
        
        # Add small randomness
        noise = random.uniform(-0.5, 0.5) if self.intelligence_level >= 2 else random.randint(-1, 1)
        estimated_tricks += noise
        
        return max(0, min(game.cards_per_round, round(estimated_tricks)))
    
    def _advanced_prediction(self, game: KachuGame, hand: List[Card]) -> int:
        """Advanced prediction with length and distribution"""
        hcp = sum(self.get_hcp_value(card, game.trump_suit) for card in hand)
        
        length_points = sum(
            self.get_length_points(hand, suit, game.trump_suit) 
            for suit in Suit
        )
        
        trump_cards = [c for c in hand if c.suit == game.trump_suit]
        trump_quality = sum(1 for c in trump_cards if c.rank >= 11) * 0.25
        
        distribution_points = self.get_distribution_points(hand, game.trump_suit)
        
        estimated_tricks = (
            hcp * 0.35 + 
            len(trump_cards) * 0.4 + 
            length_points * 0.4 + 
            trump_quality * 0.25 + 
            distribution_points * 0.25
        )
        
        # Reduce randomness at higher levels
        noise = random.uniform(-0.3, 0.3)
        estimated_tricks += noise
        
        return max(0, min(game.cards_per_round, round(estimated_tricks)))
    
    def _expert_prediction(self, game: KachuGame, hand: List[Card]) -> int:
        """Expert prediction with Monte Carlo simulation"""
        if self.intelligence_level < 8:
            return self._advanced_prediction(game, hand)
        
        # Run multiple simulations
        simulations = 50 if self.intelligence_level >= 9 else 20
        total_tricks = 0
        
        for _ in range(simulations):
            tricks_won = self._simulate_round(game, hand)
            total_tricks += tricks_won
        
        average_tricks = total_tricks / simulations
        
        # Add slight strategic bias
        if self.intelligence_level == 10:
            # Perfect play: slight conservative bias
            average_tricks *= 0.95
        
        return max(0, min(game.cards_per_round, round(average_tricks)))
    
    def _simulate_round(self, game: KachuGame, hand: List[Card]) -> int:
        """Simulate a complete round to estimate tricks"""
        # Create a simplified simulation
        # This is a placeholder for full Monte Carlo
        
        trump_cards = [c for c in hand if c.suit == game.trump_suit]
        high_cards = [c for c in hand if c.rank >= 11]
        
        # Estimate based on card strength
        likely_wins = 0
        
        # High trumps are likely to win
        for card in trump_cards:
            if card.rank >= 12:  # Q, K, A of trump
                likely_wins += 0.8
            elif card.rank >= 10:
                likely_wins += 0.6
            else:
                likely_wins += 0.3
        
        # High non-trump cards
        for card in high_cards:
            if card.suit != game.trump_suit:
                likely_wins += 0.4 if card.rank == 1 else 0.25
        
        return min(game.cards_per_round, int(likely_wins))
    
    def choose_card(self, game: KachuGame, hand: List[Card]) -> int:
        """Choose a card to play based on intelligence level"""
        if self.intelligence_level == 0:
            return self._basic_card_choice(game, hand)
        elif self.intelligence_level <= 3:
            return self._improved_card_choice(game, hand)
        elif self.intelligence_level <= 6:
            return self._strategic_card_choice(game, hand)
        else:
            return self._expert_card_choice(game, hand)
    
    def _basic_card_choice(self, game: KachuGame, hand: List[Card]) -> int:
        """Original basic card choice logic"""
        valid_cards = []
        
        for i, card in enumerate(hand):
            if game.is_valid_play(game.players[self.player_index], card):
                valid_cards.append((i, card))
        
        if not valid_cards:
            return 0
        
        if len(game.current_trick.cards) == 0:
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[len(valid_cards) // 2][0]
        else:
            trump_cards = [(i, c) for i, c in valid_cards if c.suit == game.trump_suit]
            if trump_cards:
                trump_cards.sort(key=lambda x: x[1].rank, reverse=True)
                return trump_cards[0][0]
            
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[0][0]
    
    def _improved_card_choice(self, game: KachuGame, hand: List[Card]) -> int:
        """Improved card choice with basic strategy"""
        valid_cards = self._get_valid_cards(game, hand)
        if not valid_cards:
            return 0
        
        # Update tricks needed
        player = game.players[self.player_index]
        self.beliefs.tricks_needed = (player.predicted_tricks or 0) - player.tricks_won
        
        if len(game.current_trick.cards) == 0:
            return self._choose_lead_card(game, valid_cards)
        else:
            return self._choose_follow_card(game, valid_cards)
    
    def _strategic_card_choice(self, game: KachuGame, hand: List[Card]) -> int:
        """Strategic card choice with target-based play"""
        valid_cards = self._get_valid_cards(game, hand)
        if not valid_cards:
            return 0
        
        player = game.players[self.player_index]
        self.beliefs.tricks_needed = (player.predicted_tricks or 0) - player.tricks_won
        
        # Advanced strategy based on tricks needed
        if self.beliefs.tricks_needed > 0:
            return self._play_to_win_tricks(game, valid_cards)
        elif self.beliefs.tricks_needed < 0:
            return self._play_to_avoid_tricks(game, valid_cards)
        else:
            return self._play_conservatively(game, valid_cards)
    
    def _expert_card_choice(self, game: KachuGame, hand: List[Card]) -> int:
        """Expert card choice with lookahead"""
        valid_cards = self._get_valid_cards(game, hand)
        if not valid_cards:
            return 0
        
        if self.intelligence_level >= 9:
            return self._monte_carlo_card_choice(game, valid_cards)
        else:
            return self._strategic_card_choice(game, hand)
    
    def _monte_carlo_card_choice(self, game: KachuGame, valid_cards: List[Tuple[int, Card]]) -> int:
        """Choose card using Monte Carlo tree search"""
        best_card_idx = valid_cards[0][0]
        best_score = float('-inf')
        
        simulations_per_card = 10 if self.intelligence_level >= 10 else 5
        
        for card_idx, card in valid_cards:
            total_score = 0
            
            for _ in range(simulations_per_card):
                score = self._simulate_card_play(game, card_idx, card)
                total_score += score
            
            avg_score = total_score / simulations_per_card
            if avg_score > best_score:
                best_score = avg_score
                best_card_idx = card_idx
        
        return best_card_idx
    
    def _simulate_card_play(self, game: KachuGame, card_idx: int, card: Card) -> float:
        """Simulate playing a specific card and return expected score"""
        # Simplified simulation - in practice this would be more sophisticated
        player = game.players[self.player_index]
        tricks_needed = (player.predicted_tricks or 0) - player.tricks_won
        
        # Estimate if this card will win the trick
        win_probability = self._estimate_win_probability(game, card)
        
        # Score based on whether we need tricks or not
        if tricks_needed > 0:
            return win_probability  # Want to win
        elif tricks_needed < 0:
            return 1.0 - win_probability  # Want to lose
        else:
            return 0.5  # Neutral
    
    def _estimate_win_probability(self, game: KachuGame, card: Card) -> float:
        """Estimate probability that a card will win the current trick"""
        if len(game.current_trick.cards) == 0:
            # Leading - estimate based on card strength
            if card.suit == game.trump_suit:
                return 0.7 if card.rank >= 11 else 0.5
            else:
                return 0.6 if card.rank >= 12 else 0.4
        
        # Following - check if we can beat current best
        current_winner = self._get_current_trick_winner(game)
        if current_winner and self._can_beat_card(card, current_winner[1], game):
            return 0.8
        else:
            return 0.2
    
    def _get_current_trick_winner(self, game: KachuGame) -> Optional[Tuple[int, Card]]:
        """Get the current winning card in the trick"""
        if not game.current_trick.cards:
            return None
        
        winner_idx = 0
        winner_card = game.current_trick.cards[0][1]
        
        for i, (player_idx, card) in enumerate(game.current_trick.cards[1:], 1):
            if self._can_beat_card(card, winner_card, game):
                winner_idx = i
                winner_card = card
        
        return (game.current_trick.cards[winner_idx][0], winner_card)
    
    def _can_beat_card(self, card: Card, other_card: Card, game: KachuGame) -> bool:
        """Check if one card can beat another"""
        # Trump beats non-trump
        if card.suit == game.trump_suit and other_card.suit != game.trump_suit:
            return True
        if other_card.suit == game.trump_suit and card.suit != game.trump_suit:
            return False
        
        # Same suit - higher rank wins
        if card.suit == other_card.suit:
            return card.rank > other_card.rank
        
        # Different non-trump suits - can't beat
        return False
    
    def _get_valid_cards(self, game: KachuGame, hand: List[Card]) -> List[Tuple[int, Card]]:
        """Get list of valid cards to play"""
        valid_cards = []
        player = game.players[self.player_index]
        
        for i, card in enumerate(hand):
            if game.is_valid_play(player, card):
                valid_cards.append((i, card))
        
        return valid_cards
    
    def _choose_lead_card(self, game: KachuGame, valid_cards: List[Tuple[int, Card]]) -> int:
        """Choose a card when leading"""
        if self.beliefs.tricks_needed > 0:
            # Try to win: lead strong cards
            trump_cards = [(i, c) for i, c in valid_cards if c.suit == game.trump_suit]
            if trump_cards:
                trump_cards.sort(key=lambda x: x[1].rank, reverse=True)
                return trump_cards[0][0]
            
            # Lead highest non-trump
            valid_cards.sort(key=lambda x: x[1].rank, reverse=True)
            return valid_cards[0][0]
        else:
            # Try to lose: lead weak cards
            non_trump = [(i, c) for i, c in valid_cards if c.suit != game.trump_suit]
            if non_trump:
                non_trump.sort(key=lambda x: x[1].rank)
                return non_trump[0][0]
            
            # Only have trump
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[0][0]
    
    def _choose_follow_card(self, game: KachuGame, valid_cards: List[Tuple[int, Card]]) -> int:
        """Choose a card when following"""
        current_winner = self._get_current_trick_winner(game)
        
        if self.beliefs.tricks_needed > 0:
            # Try to win the trick
            for card_idx, card in valid_cards:
                if current_winner and self._can_beat_card(card, current_winner[1], game):
                    return card_idx
            
            # Can't win, play lowest
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[0][0]
        else:
            # Try to lose the trick
            for card_idx, card in valid_cards:
                if not current_winner or not self._can_beat_card(card, current_winner[1], game):
                    # This card won't win, prefer it
                    return card_idx
            
            # All cards will win, play lowest winner
            valid_cards.sort(key=lambda x: x[1].rank)
            return valid_cards[0][0]
    
    def _play_to_win_tricks(self, game: KachuGame, valid_cards: List[Tuple[int, Card]]) -> int:
        """Play aggressively to win tricks"""
        return self._choose_follow_card(game, valid_cards)
    
    def _play_to_avoid_tricks(self, game: KachuGame, valid_cards: List[Tuple[int, Card]]) -> int:
        """Play defensively to avoid winning tricks"""
        return self._choose_follow_card(game, valid_cards)
    
    def _play_conservatively(self, game: KachuGame, valid_cards: List[Tuple[int, Card]]) -> int:
        """Play conservatively when on target"""
        # Just play middle cards
        valid_cards.sort(key=lambda x: x[1].rank)
        middle_idx = len(valid_cards) // 2
        return valid_cards[middle_idx][0]


class HintSystem:
    """Provides hints about what AI would do"""
    
    @staticmethod
    def get_prediction_hint(game: KachuGame, player_index: int, intelligence_level: int) -> Dict:
        """Get what AI would predict at different intelligence levels"""
        ai = AIIntelligence(player_index, intelligence_level)
        ai.reset_for_new_round(game)
        
        hand = game.players[player_index].hand
        prediction = ai.make_prediction(game, hand)
        
        # Analyze hand strength
        trump_cards = [c for c in hand if c.suit == game.trump_suit]
        high_cards = [c for c in hand if c.rank >= 11]
        hcp = sum(ai.get_hcp_value(c, game.trump_suit) for c in hand)
        
        analysis = {
            "prediction": prediction,
            "trump_cards": len(trump_cards),
            "high_cards": len(high_cards),
            "hcp": round(hcp, 1),
            "reasoning": HintSystem._get_prediction_reasoning(
                prediction, trump_cards, high_cards, hcp, intelligence_level
            )
        }
        
        return analysis
    
    @staticmethod
    def _get_prediction_reasoning(prediction: int, trump_cards: List, high_cards: List, 
                                 hcp: float, intelligence_level: int) -> str:
        """Generate explanation for prediction"""
        if intelligence_level <= 2:
            return f"Basic analysis: {len(trump_cards)} trump cards, {len(high_cards)} high cards"
        elif intelligence_level <= 5:
            return f"HCP: {hcp}, Trump: {len(trump_cards)}, High cards: {len(high_cards)}"
        else:
            return f"Advanced analysis: {hcp} HCP, {len(trump_cards)} trumps, considering distribution and length"
    
    @staticmethod
    def get_card_hint(game: KachuGame, player_index: int, intelligence_level: int) -> Dict:
        """Get what AI would play at different intelligence levels"""
        ai = AIIntelligence(player_index, intelligence_level)
        ai.reset_for_new_round(game)
        
        hand = game.players[player_index].hand
        card_idx = ai.choose_card(game, hand)
        
        if 0 <= card_idx < len(hand):
            suggested_card = hand[card_idx]
            reasoning = HintSystem._get_card_reasoning(game, ai, suggested_card, intelligence_level)
            
            return {
                "card_index": card_idx,
                "card": suggested_card.to_dict(),
                "reasoning": reasoning
            }
        
        return {"error": "No valid card found"}
    
    @staticmethod
    def _get_card_reasoning(game: KachuGame, ai: AIIntelligence, card: Card, intelligence_level: int) -> str:
        """Generate explanation for card choice"""
        player = game.players[ai.player_index]
        tricks_needed = (player.predicted_tricks or 0) - player.tricks_won
        
        if intelligence_level <= 2:
            return f"Playing {card} - basic strategy"
        elif intelligence_level <= 5:
            if tricks_needed > 0:
                return f"Playing {card} - need {tricks_needed} more tricks, playing to win"
            elif tricks_needed < 0:
                return f"Playing {card} - have {abs(tricks_needed)} extra tricks, playing to lose"
            else:
                return f"Playing {card} - on target, playing safely"
        else:
            strategy = "Advanced strategy: "
            if len(game.current_trick.cards) == 0:
                strategy += "Leading with "
            else:
                strategy += "Following with "
            
            if card.suit == game.trump_suit:
                strategy += f"trump {card}"
            else:
                strategy += f"{card}"
            
            if tricks_needed != 0:
                strategy += f" (need {tricks_needed} tricks)"
            
            return strategy
