# Need for Sheep

Need for Sheep: herd the flock into the pen with one, two or three dogs, and sort ewes from lambs. 36 levels over six farms. One HTML file plus five sound clips in [`audio/`](audio), no build step: open [`index.html`](index.html).

Two levels carry a three-step tutorial: the first level teaches herding, Shepherd's test teaches splitting a flock with a bark. Each prompt points at where to go and moves on once you have done it.

Controls: drag to run the dog (close to walk, far to sprint) or arrow keys / WASD with Shift to sprint. Space barks. Tab or right-click switches dog, 1-3 picks one. P or Esc pauses (so does leaving the window), R restarts, M mutes, G hides the ghost, Enter goes on from the results.

Sorting pens are labelled EWES or LAMBS. They take any sheep but only count their own kind, and a sheep in the wrong pen stays free to be driven out. A gate swings shut once its pen holds every sheep it needs. Your best run on each level comes back as a ghost dog to race.

## Play on this Mac

```
./app/install_app.sh   # puts Need for Sheep in /Applications
./app/make_icon.sh     # only needed after editing app/icon.html
```

The app opens the game in its own Brave window. The folder path is baked in, so re-run `install_app.sh` if this folder moves.

## Online leaderboard

After a win, **Leaderboard** lets the player send their time under a name and shows the top five for that level (best time per name). Each time carries its run's dog paths: tap a row to race that ghost. Scores live in a free [Supabase](https://supabase.com) project:

1. Create a project, open **SQL Editor**, paste [`leaderboard.sql`](leaderboard.sql) and run it (re-running it on an existing project adds the ghost column).
2. In **Project Settings > API**, copy the project URL and the `anon` public key into `const BOARD={url:'',key:''}` in `index.html`.

The anon key is meant to be public: row-level security lets visitors only add a time (above a per-level floor) and read the board. While `BOARD.url` is empty the button stays hidden.

## Herding bot

`node tools/bot.cjs [levelId ...]` plays levels with the game's own simulation, one dog at a time, trying a few styles from careful to bold, and prints its best time beside each level's star times. Use it to check a new or changed level can be finished and to set its stars (gold about 1.5x the bot, 1.3x for sorting levels, the other star 1.4x gold) and the leaderboard floor (0.7x the bot). It still struggles with sheep pinned in field corners, so a FAIL means "look at it", not "impossible".
