import React from 'react';

/**
 * A count, set apart from the thing being counted.
 *
 * WHY IT IS WORTH SETTING APART. Two packages of one service carry the same
 * name, the same classifications and the same everything, and differ by a
 * number. Set at the weight of the words around it, that number is the least
 * visible thing on a page whose whole job is telling one from the other. It
 * takes the size and the weight; the words it counts step back to make room.
 *
 * formatDeliverable always puts the quantity first when there is one — "2
 * Edited photographs" — so the leading integer is separable, and a line with no
 * quantity is returned untouched rather than mangled.
 *
 * Not the accent. Wherever this appears there is already one accent doing a
 * job, and two things competing for it is how an accent stops meaning anything.
 *
 * SMALLER WHERE THE LIST IS A DETAIL RATHER THAN THE ANSWER. On a card, and in
 * the section collating what the whole package promises, this list IS what the
 * reader came for and the count leads at full size. Inside a service fold it is
 * one of four things said about that service, two levels down the page — at the
 * same size it shouts over the headings around it and over the collated list it
 * is a breakdown of.
 *
 * It lives here rather than beside the card that first needed it because the
 * same list is drawn four times — on the card, on the package page, inside each
 * service on that page, and in the editor — and a formatter copied into four
 * files is four formatters the day one of them is corrected.
 */
export function Counted({ text, small }: { text: string; small?: boolean }) {
  const m = text.match(/^(\d+)\s+(.*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className={small ? 'q-count-sm' : 'q-lead-num'}>{m[1]}</span> {m[2]}
    </>
  );
}
