# Same-day goal starting weight

A weight entered or corrected on the current goal's first local day also corrects
its starting weight. The goal ID, start day, target, pace and calorie-plan history
stay intact. Weights retain the existing tenth-of-a-unit input precision and
canonical gram storage. An unsafe corrected plan uses the existing review state;
the correction does not silently change its target or pace.

The existing model has no separate start-date field. The start day is the local
date of `Goal.created_at` in the user's timezone, as used by Progress and
calibration. Correction requires that start day, the metric's date and the current
user-local day all match after acquiring the calorie-planning lock.
The timezone is reread inside that transaction after the lock, so a profile
change that commits first determines eligibility and the default metric date.
Wear and import weight writers acquire the same guard before metric rows to
avoid reversing the lock order against normal corrections.

Offline weight intent remains `{ weight, date }` plus its stable operation ID.
Until accepted, the app shows the pending metric and retains the server-owned
goal; calorie targets/projections remain marked as syncing. Replay refreshes the
goal query. A first replay after the start day saves the metric but leaves the
older baseline unchanged: there is no verified original-submission day in this
protocol. Retrying an already committed operation returns its original receipt
without overwriting later corrections. Historical edits, body-fat-only updates
and other goals are not baseline corrections.
