# Chessly Exporter

This is a utility to somewhat automate transcribing Chessly courses to PGNs. Pressing a keyboard shortcut will capture the current move and analysis. This combined with the arrow keys for easy navigation means you can transcribe an entire variation in less than a minute.

# Installation

1) Download this repository.
2) Install a Python environment. I like `uv`.
3) Download `pgn-extract` from https://www.cs.kent.ac.uk/people/staff/djb/pgn-extract/.
4) Install the Firefox and the extension with the "load temporary extension" button in `about:debugging`.

# Usage

1) Start the server with `uv run pgn_exporter.py`.
2) Arrow through a variation, pressing `alt+shif+q` to capture the current move and analysis.
3) Press `alt+shift+m` and enter the move to capture the final move of the variation.
4) Press `alt+shift+z` to export a PGN of the variation.
5) Merge variations together with `uv run merge-pgn.py  output/study-*.pgn output/merged.pgn` 
6) Verify the number of variations is correct with `./pgn-extract output/merged.pgn --splitvariants && grep -c Event`

# Acknowledgements

Thank you to [olleeriksson](https://github.com/olleerkisson) for the `merge-pgn.py` script that I shamelessly yoinked.