/**
 * WHAT A NAVIGATION LOOKS LIKE WHILE IT IS HAPPENING.
 *
 * There was no loading state anywhere in this app, so a click that genuinely
 * needed the server showed the PREVIOUS page, unchanged and unresponsive, until
 * the new one arrived. Nothing said the app had heard the click - which is the
 * difference an operator feels between an app and a website, quite apart from
 * how long the wait is.
 *
 * Next renders this the moment a navigation starts, so the shell (the
 * navigation, the studio's name) stays put and the page's own area says it is
 * working. It costs one file and no request.
 *
 * It is deliberately a shape and not a spinner: the frame of a page header and
 * a few rows, so the eye lands where the content will be rather than on a
 * rotating thing in the middle of nothing.
 */
export default function Loading() {
  return (
    <div className="q-wait" aria-busy="true" aria-live="polite">
      <span className="q-wait-said">Reading the studio&apos;s records…</span>
      <span className="q-wait-title" />
      <span className="q-wait-bar" />
      <div className="q-wait-rows">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="q-wait-row" />)}
      </div>
    </div>
  );
}
