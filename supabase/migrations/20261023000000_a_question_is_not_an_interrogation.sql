-- A question is not an interrogation.
--
-- "Where, and under what conditions?" is what this repository seeded as the
-- Context dimension's question, and it is what a client reads on the public
-- booking form. It was written here, in a migration — it is not something any
-- studio typed — and it reads like a form at a border crossing rather than a
-- studio asking where a shoot is happening.
--
-- The dimension asks about a place. Its values are Studio and Outdoor. So the
-- question is where it takes place, and the second clause was never asking
-- anything: no answer in the list is a "condition".
--
-- ONLY WHERE IT IS STILL THE SEEDED DEFAULT. A studio that has since written
-- its own question owns that question, and this must not reach in and rewrite
-- it — which is why the update is keyed on the exact string this repository
-- put there rather than on the dimension's name. A studio that happens to have
-- typed this sentence itself is indistinguishable from the default and gets
-- the change; that is the trade, and it favours the many studios that never
-- touched it.
--
-- ACROSS EVERY ORGANIZATION, not just the one where it was noticed. A fix that
-- only reaches the studio where somebody spotted it leaves the same sentence
-- in front of every other studio's clients.

update dimensions
   set question = 'Where does it take place?'
 where question = 'Where, and under what conditions?';
