# ADR 0005: Notification delivery and realtime state

Status: accepted for the first self-hosted Android/Wear release.

## Decision

The in-app notification record is the canonical reminder state. Connected web clients receive
state-change hints over an authenticated Server-Sent Events (SSE) stream and refetch the canonical
feed. Periodic polling and service-worker messages remain fallback paths; none of the transports is
treated as the data store.

Native push has three deliberately different operating modes:

| Mode | Release support | Intended use |
| --- | --- | --- |
| Expo push | Supported for development and private/internal Android builds | Convenient remote delivery without operating a push gateway |
| Direct FCM HTTP v1 | Not part of the first release promise | Required before offering independently operated production native push to a wider audience |
| Disabled | Supported for fully local/self-hosted deployments | In-app state and foreground refresh continue without a hosted push dependency; background phone reminders are not yet guaranteed |

An operator must be able to disable native push explicitly. The public client configuration must
report that capability so Android does not request notification permission or register an Expo token
when the server has disabled native push.

Web push remains optional and requires the operator's VAPID configuration. Missing web-push
configuration must not prevent creation of the canonical in-app reminder.

## Duplicate prevention

Server-created reminders use a per-user, per-reminder, per-local-day dedupe key. Delivery records track
whether a subscription has already received that local day's reminder. Phone and watch local reminder
coordination must use the synchronized reminder identity and resolution state; a transport retry must
never create a second domain notification.

## Consequences

- A self-host can run without Expo, Firebase, or any other hosted notification service. In this mode the canonical
  reminder and foreground UI remain reliable, but the current phone client does not schedule a local background
  notification. The watch can also suppress its local alert while the phone is reachable, so operators must not
  promise background reminder delivery until a coordinated local fallback policy is implemented and tested.
- Expo delivery is best effort and is not described as an independently self-hosted production push
  channel.
- SSE fanout is currently process-local, which matches the single-application-container Compose
  topology. A horizontally scaled deployment requires shared pub/sub before it is supported.
- Direct FCM, Play Console service-account operations, and public delivery SLOs remain follow-up work
  if the release audience expands beyond private/internal use.
