# Board and Card Games

Download the repository with **Code → Download ZIP** or clone it. Open the folder for the game you want to play.

| Game | How to start |
| --- | --- |
| [Camel Up](camel-up/README.md) | On Windows with Node.js 22.18 or later, open `camel-up/Play Camel Up.cmd`. Play solo with bots or host a table for friends on the same network. |
| [Clue — The Gilded Alibi](clue/README.md) | In `clue/`, use Node.js 22.13 or later and run `npm install`, then `npm run dev`. Open [localhost:3000](http://localhost:3000). |
| [Kachu — Judgment](kachu/README.md) | In `kachu/`, use Python 3.11 and run `python -m pip install -r requirements.txt`, then `python app.py`. Open [localhost:5000](http://localhost:5000). |

The first installation downloads dependencies. Each game runs on your computer. Kachu generates a Flask signing key at startup unless you set `KACHU_SECRET_KEY`.
