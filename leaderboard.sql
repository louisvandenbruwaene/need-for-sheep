-- Need for Sheep online leaderboard. Paste into Supabase > SQL Editor and run once.
-- Anyone may add a time and read the board. Nobody (without the service key) may edit or delete.

create table if not exists scores (
  id      bigint generated always as identity primary key,
  level   int  not null check (level between 0 and 35),
  name    text not null check (char_length(name) between 1 and 16),
  time    real not null check (time > 0 and time < 600),
  ghost   jsonb check (ghost is null or octet_length(ghost::text) < 150000), -- the dogs' paths, 10 samples a second
  created timestamptz not null default now()
);
alter table scores add column if not exists ghost jsonb check (ghost is null or octet_length(ghost::text) < 150000);

alter table scores enable row level security;

-- A time well under the herding bot's best run is not a real run. One entry per level, index = level number - 1.
-- The floors are 0.7 x the bot's best time; re-run this file after adding or changing levels.
drop policy if exists "anyone adds a plausible time" on scores;
create policy "anyone adds a plausible time" on scores for insert to anon
  with check (time >= (array[3,2.5,7,4.5,6.5,4.5,7.5,10,9,6,2.5,13.5,10.5,10.5,10.5,5,15,16,4,10.5,10,12,4,17.5,31.5,7.5,20.5,5.5,14.5,24.5,10,5.5,
                             9.5,7,19.5,37.5])[level + 1]);

-- The board shows each name once, with its best time and that run's ghost.
drop view if exists best;
create view best with (security_invoker = false) as
  select distinct on (level, name) level, name, time, ghost
  from scores order by level, name, time;

revoke all on scores from anon;
grant insert (level, name, time, ghost) on scores to anon;
grant select on best to anon;
