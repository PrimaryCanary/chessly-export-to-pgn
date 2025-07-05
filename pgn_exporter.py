# /// script
# dependencies = [
#     "python-chess",
#     "flask",
#     "flask-cors",
#     "colorama"
# ]
# ///

# Run with uv.exe run pgn_exporter.py
# Click through all the variations with alt-shift-q, alt-shift-m, and alt-shift-z after every variation
# Generate a PGN and verify the number of variations with:
# uv.exe run merge-pgn.py  output/study-*.pgn  output/merged.pgn && ./pgn-extract.exe output/merged.pgn --splitvariants && grep -c Event
# pgn-extract comes from https://www.cs.kent.ac.uk/people/staff/djb/pgn-extract/

import chess
import chess.pgn
from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime
import os
import re
from colorama import init as colorama_init
from colorama import Fore
from colorama import Style

app = Flask(__name__)
CORS(app)

games = []
current_game = None
current_board_state = None
current_pgn_node = None
is_starting_new_variation = False

@app.route('/capture_move', methods=['POST'])
def capture_move():
    global current_game, current_board_state, current_pgn_node, is_starting_new_variation
    data = request.json
    move_san = data.get('move')
    comment = data.get('comment')

    if not current_game:
        print("Starting new game.")
        current_game = chess.pgn.Game()
        current_board_state = chess.Board()
        current_game.setup(current_board_state)
        current_pgn_node = current_game

    try:
        # Handle move_san from content_script.js (e.g., "1. e4") or content_script_comment.js (e.g., "Bd7")
        if ' ' in move_san:
            san_only = move_san.split(' ')[1]
        else:
            san_only = move_san
        
        move = current_board_state.parse_san(san_only)

        if is_starting_new_variation:
            new_node = current_pgn_node.add_variation(move)
            new_node.comment = comment
            is_starting_new_variation = False
            print(f"Captured new variation move: {san_only}, comment: {comment}")
        else:
            current_board_state.push(move)
            current_pgn_node = current_pgn_node.add_variation(move)
            current_pgn_node.comment = comment
            print(f"Captured main line move: {san_only}, comment: {comment}")

    except Exception as e:
        print(f"{Fore.RED}Error capturing move: {e}{Style.RESET_ALL}")
        return jsonify({"status": "error", "message": str(e)}), 400

    return jsonify({"status": "success"})

@app.route('/export_pgn', methods=['POST'])
def export_pgn():
    global current_game, current_board_state, current_pgn_node, games
    print("Received /export_pgn request.")

    if current_game:
        games.append(current_game)
        current_game = None
        current_board_state = None
        current_pgn_node = None
        print("Appended final game to games list and reset current_game, board, and node.")

    if not games:
        print("No games to export.")
        return jsonify({"status": "no games to export"})

    # Set headers (optional, but good practice for PGN)
    # Assuming we export all unique games, not just one main_game
    # The original script exported all games in the 'games' list.
    # If the intention is to export only the *current* game, this logic needs adjustment.
    # For now, I'll adapt to export all collected games.

    # Determine the next available study-<i>.pgn filename
    existing_study_files = [f for f in os.listdir('output/') if re.match(r'study-\d+\.pgn', f)]
    existing_indices = []
    for f in existing_study_files:
        match = re.search(r'study-(\d+)\.pgn', f)
        if match:
            existing_indices.append(int(match.group(1)))
    
    next_index = 1
    if existing_indices:
        next_index = max(existing_indices) + 1
    
    filename = f"output/study-{next_index}.pgn"
    
    with open(filename, "w") as f:
        for game in games: # Iterate through all collected games
            game.headers["Event"] = "Chessly PGN Export"
            game.headers["Site"] = "https://chessly.com"
            game.headers["Date"] = datetime.datetime.now().strftime("%Y.%m.%d")
            game.headers["Round"] = "1"
            game.headers["White"] = "Player1"
            game.headers["Black"] = "Player2"
            game.headers["Result"] = "*" # Unknown result for analysis
            
            exporter = chess.pgn.FileExporter(f)
            game.accept(exporter)
            f.write("\n\n")
    print(f"PGN exported to {filename}")

    games = [] # Clear the list after export
    print("Cleared games list.")
    return jsonify({"status": "success", "filename": filename})

if __name__ == '__main__':
    colorama_init()
    print("Starting Flask app on port 5000...")
    app.run(port=5000)
