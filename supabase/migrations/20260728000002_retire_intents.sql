-- Retire the intents table — the absorption is complete.
--
-- A lead is a booking in `inquiry` status. The public /book flow now creates a
-- contact + client + booking(+line) directly; the proposal portal and intent
-- actions are deleted. Nothing reads or writes intents anymore.
alter table contracts drop column if exists intent_id;
drop table if exists intents cascade;
