"""
Flask backend for Kachu (Judgment) card game
"""

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import os
import secrets
import uuid
from game_logic import KachuGame

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('KACHU_SECRET_KEY') or secrets.token_hex(32)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Store active games
games = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game/<game_id>')
def game(game_id):
    return render_template('game.html', game_id=game_id)

@socketio.on('create_game')
def handle_create_game(data):
    """Create a new game"""
    try:
        num_players = int(data.get('num_players', 4))
        player_name = data.get('player_name', 'You')
        ai_intelligence = int(data.get('ai_intelligence', 5))
        
        if num_players < 2 or num_players > 8:
            emit('error', {'message': 'Number of players must be between 2 and 8'})
            return
        
        game_id = str(uuid.uuid4())[:8]
        game = KachuGame(num_players, player_name, ai_intelligence)
        games[game_id] = game
        
        join_room(game_id)
        
        emit('game_created', {
            'game_id': game_id,
            'game_state': game.get_game_state(),
            'ai_intelligence': ai_intelligence
        })
        
    except Exception as e:
        emit('error', {'message': f'Error creating game: {str(e)}'})

@socketio.on('join_game')
def handle_join_game(data):
    """Join an existing game"""
    try:
        game_id = data.get('game_id')
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        join_room(game_id)
        game = games[game_id]
        
        emit('game_joined', {
            'game_id': game_id,
            'game_state': game.get_game_state()
        })
        
    except Exception as e:
        emit('error', {'message': f'Error joining game: {str(e)}'})

@socketio.on('start_round')
def handle_start_round(data):
    """Start a new round"""
    try:
        game_id = data.get('game_id')
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        game.start_new_round()
        
        # Make AI predictions automatically
        for i, player in enumerate(game.players):
            if not player.is_human:
                ai_prediction = game.get_ai_prediction(i)
                game.make_prediction(i, ai_prediction)
        
        # Check if all predictions are made (human player still needs to predict)
        if game.all_predictions_made():
            game.start_playing_phase()
        
        # Emit to all players in the room
        socketio.emit('round_started', {
            'game_state': game.get_game_state()
        }, room=game_id)
        
    except Exception as e:
        emit('error', {'message': f'Error starting round: {str(e)}'})

@socketio.on('make_prediction')
def handle_make_prediction(data):
    """Handle player prediction"""
    try:
        game_id = data.get('game_id')
        player_index = int(data.get('player_index', 0))
        prediction = int(data.get('prediction'))
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        
        if game.make_prediction(player_index, prediction):
            # Emit updated game state immediately
            socketio.emit('prediction_made', {
                'game_state': game.get_game_state()
            }, room=game_id)
            
            # Check if all predictions are made and start playing
            if game.all_predictions_made():
                game.start_playing_phase()
                
                # Emit game state update for playing phase
                socketio.emit('prediction_made', {
                    'game_state': game.get_game_state()
                }, room=game_id)
                
                # If it's an AI player's turn to start, handle it automatically
                if not game.players[game.current_player].is_human:
                    socketio.start_background_task(target=handle_ai_turn, game_id=game_id)
        else:
            emit('error', {'message': 'Invalid prediction'})
            
    except Exception as e:
        emit('error', {'message': f'Error making prediction: {str(e)}'})

def handle_ai_turn(game_id):
    """Handle AI player turns automatically with delays"""
    import time
    
    if game_id not in games:
        return
    
    game = games[game_id]
    
    # Only handle one AI move at a time to prevent infinite loops
    if (game.phase == "playing" and 
        not game.players[game.current_player].is_human):
        
        # Reduced delay for faster gameplay
        time.sleep(0.6)
        
        ai_card_index = game.get_ai_card_choice(game.current_player)
        if game.play_card(game.current_player, ai_card_index):
            # Emit updated game state after AI move
            socketio.emit('card_played', {
                'game_state': game.get_game_state()
            }, room=game_id)
            
            # If it's still an AI's turn, schedule another AI move
            if (game.phase == "playing" and 
                not game.players[game.current_player].is_human):
                socketio.start_background_task(target=handle_ai_turn, game_id=game_id)

@socketio.on('play_card')
def handle_play_card(data):
    """Handle card play"""
    try:
        game_id = data.get('game_id')
        player_index = int(data.get('player_index', 0))
        card_index = int(data.get('card_index'))
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        
        if game.play_card(player_index, card_index):
            # Emit updated game state
            socketio.emit('card_played', {
                'game_state': game.get_game_state()
            }, room=game_id)
            
            # Handle AI turns in background if it's AI's turn next
            if (game.phase == "playing" and 
                not game.players[game.current_player].is_human):
                socketio.start_background_task(target=handle_ai_turn, game_id=game_id)
                
        else:
            emit('error', {'message': 'Invalid card play'})
            
    except Exception as e:
        emit('error', {'message': f'Error playing card: {str(e)}'})

@socketio.on('get_game_state')
def handle_get_game_state(data):
    """Get current game state"""
    try:
        game_id = data.get('game_id')
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        emit('game_state_update', {
            'game_state': game.get_game_state()
        })
        
    except Exception as e:
        emit('error', {'message': f'Error getting game state: {str(e)}'})

@socketio.on('continue_game')
def handle_continue_game(data):
    """Continue to next round"""
    try:
        game_id = data.get('game_id')
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        
        if game.phase == "round_end":
            game.start_new_round()
            
            # Make AI predictions automatically for new round
            for i, player in enumerate(game.players):
                if not player.is_human:
                    ai_prediction = game.get_ai_prediction(i)
                    game.make_prediction(i, ai_prediction)
            
            # Check if all predictions are made (human player still needs to predict)
            if game.all_predictions_made():
                game.start_playing_phase()
                
                # If it's an AI player's turn to start, handle it automatically
                if not game.players[game.current_player].is_human:
                    socketio.start_background_task(target=handle_ai_turn, game_id=game_id)
        
        socketio.emit('game_continued', {
            'game_state': game.get_game_state()
        }, room=game_id)
        
    except Exception as e:
        emit('error', {'message': f'Error continuing game: {str(e)}'})

@socketio.on('set_ai_intelligence')
def handle_set_ai_intelligence(data):
    """Update AI intelligence level"""
    try:
        game_id = data.get('game_id')
        intelligence_level = int(data.get('intelligence_level', 5))
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        game.set_ai_intelligence(intelligence_level)
        
        emit('ai_intelligence_updated', {
            'intelligence_level': intelligence_level
        })
        
    except Exception as e:
        emit('error', {'message': f'Error updating AI intelligence: {str(e)}'})

@socketio.on('get_hint')
def handle_get_hint(data):
    """Get hint for human player"""
    try:
        game_id = data.get('game_id')
        hint_type = data.get('hint_type', 'prediction')
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        hint = game.get_hint_for_human(hint_type)
        
        emit('hint_received', {
            'hint': hint,
            'hint_type': hint_type
        })
        
    except Exception as e:
        emit('error', {'message': f'Error getting hint: {str(e)}'})

@socketio.on('get_game_logs')
def handle_get_game_logs(data):
    """Get game logs"""
    try:
        game_id = data.get('game_id')
        round_num = data.get('round_num')  # Optional filter by round
        
        if game_id not in games:
            emit('error', {'message': 'Game not found'})
            return
        
        game = games[game_id]
        logs = game.get_game_logs(round_num)
        
        emit('game_logs_received', {
            'logs': logs,
            'current_round': game.current_round
        })
        
    except Exception as e:
        emit('error', {'message': f'Error getting logs: {str(e)}'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnect"""
    print('Client disconnected')

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
