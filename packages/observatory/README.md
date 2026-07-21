# `@ue-shed/observatory`

Actor discovery, stable identity, bounded snapshots, spatial projection, and focus operations. The
first implemented slice powers Map Review's Live World Scout through validated Remote Control calls;
bounded deltas, retained observations, and replay remain later Observatory work.

## Live actor observation

`Observatory.observe(endpoint, options)` owns the full demand-driven observation lifecycle and
returns an Effect `Stream` of `WorldObservationState`:

```ts
Observatory.observe(endpoint, { cadenceHz: 30 }).pipe(
	Stream.runForEach((state) => Effect.sync(() => render(state)))
);
```

It negotiates `StartActorObservation` over Remote Control, opens a scoped named-pipe server for the
returned pipe name, installs the actor catalog, and applies decoded USOT v1 transform batches into
`WorldObservationState` (`connecting` → `live` → `stale` → …). Resets and session changes reacquire a
fresh catalog automatically; sustained rejection or negotiation failure surfaces a typed
`ActorObservationSessionError` or `ActorObservationRecoveryExhaustedError` after a bounded number of
recovery attempts. `StopActorObservation` is always called when the stream's scope closes.

When the connected editor cannot stream (`not_supported`, e.g. non-Windows), `observe` falls back to
bounded `GetActorSnapshot` polling at ≤10 Hz and emits `polling_fallback` states instead of failing.

`snapshot` and `focus` remain for one-shot CLI and compatibility use.

The lower-level `ActorFeed` service (`actorFeedLayer`, `acquireActorFeedScoped`) owns just the
named-pipe transport and incremental USOT decoding, with a bounded sliding `PubSub` so a slow
subscriber only ever sees the newest packet rather than an unbounded backlog.
