-- Need for Sheep online leaderboard. Paste into Supabase > SQL Editor and run once.
-- Anyone may add a time and read the board. Nobody (without the service key) may edit or delete.

create table if not exists scores (
  id      bigint generated always as identity primary key,
  level   int  not null check (level between 0 and 49),
  name    text not null check (char_length(name) between 1 and 16),
  time    real not null check (time > 0 and time < 3600),
  ghost   jsonb check (ghost is null or octet_length(ghost::text) < 300000), -- the dogs' paths, 10 samples a second
  created timestamptz not null default now()
);
alter table scores add column if not exists ghost jsonb;
-- widen the checks on a project made before the Open hill levels (more levels, longer runs, longer ghosts)
alter table scores drop constraint if exists scores_level_check, add constraint scores_level_check check (level between 0 and 49);
alter table scores drop constraint if exists scores_time_check, add constraint scores_time_check check (time > 0 and time < 3600);
alter table scores drop constraint if exists scores_ghost_check, add constraint scores_ghost_check check (ghost is null or octet_length(ghost::text) < 300000);

alter table scores enable row level security;

-- A time well under the herding bot's best run is not a real run. One entry per level, index = level number - 1.
-- The floors are 0.7 x the best bot time (tools/bot.cjs, or the older bot where that was faster);
-- on the Open hill levels (37-43) 0.4 x, since the bot herds big flocks in pieces and a person is much quicker.
-- Re-run this file after adding or changing levels.
drop policy if exists "anyone adds a plausible time" on scores;
create policy "anyone adds a plausible time" on scores for insert to anon
  with check (time >= (array[3,5,14,5.5,19.5,20,13.5,74.5,98.5,16.5,4.5,35,12,70.5,81,13,15,93,17,5.5,14,56.5,4,184,72,7.5,118,105.5,173,136.5,164,22.5,39.5,81.5,151.5,255,36,77.5,41.5,39.5,179,87.5,198.5,83,0,0,0,0,131,176.5])[level + 1]);

-- The board shows each name once, with its best time and that run's ghost.
drop view if exists best;
create view best with (security_invoker = false) as
  select distinct on (level, name) level, name, time, ghost
  from scores order by level, name, time;

revoke all on scores from anon;
grant insert (level, name, time, ghost) on scores to anon;
grant select on best to anon;
