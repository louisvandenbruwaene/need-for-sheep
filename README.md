# Need for Sheep

Need for Sheep: herd the flock into the pen with one, two or three dogs, and sort ewes from lambs. One self-contained HTML file, no build step: open [`index.html`](index.html).

## Play on this Mac

```
./app/install_app.sh   # puts Need for Sheep in /Applications
./app/make_icon.sh     # only needed after editing app/icon.html
```

The app opens the game in its own Brave window. The folder path is baked in, so re-run `install_app.sh` if this folder moves.

## Online leaderboard

After a win, **Leaderboard** lets the player send their time under a name and shows the top five for that level (best time per name). Scores live in a free [Supabase](https://supabase.com) project:

1. Create a project, open **SQL Editor**, paste [`leaderboard.sql`](leaderboard.sql) and run it.
2. In **Project Settings > API**, copy the project URL and the `anon` public key into `const BOARD={url:'',key:''}` in `index.html`.

The anon key is meant to be public: row-level security lets visitors only add a time (above a per-level floor) and read the board. While `BOARD.url` is empty the button stays hidden.
