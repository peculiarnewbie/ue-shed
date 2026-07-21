# Observatory actor-transform stream contract v1

The live path is a byte stream of fixed-size 96-byte little-endian headers followed immediately by
zero or more 48-byte transform records. Receivers must resynchronize on the ASCII magic `USOT`,
reject unsupported versions and lengths, and cap allocations before reading payloads. A reconnect
or catalog invalidation starts a new session/revision; records that do not match the retained
catalog must not be applied.

Header:

| Offset | Type    | Field                                                     |
| -----: | ------- | --------------------------------------------------------- |
|      0 | char[4] | `USOT` magic                                              |
|      4 | u16     | version, `1`                                              |
|      6 | u16     | header length, `96`                                       |
|      8 | u16     | record length, `48`                                       |
|     10 | u16     | flags; bit 0 is reset/catalog-invalidated                 |
|     12 | u32     | record count, at most 16,384                              |
|     16 | u32     | payload length, exactly `recordCount * 48`                |
|     20 | u32     | reserved, zero                                            |
|     24 | u64     | session-local packet sequence                             |
|     32 | f64     | Unreal world seconds at sampling                          |
|     40 | f64     | producer monotonic milliseconds at sampling               |
|     48 | u8[16]  | observation session ID                                    |
|     64 | u64     | catalog revision                                          |
|     72 | u32     | actors sampled                                            |
|     76 | u32     | actors changed in this packet                             |
|     80 | u32     | cumulative producer replacements                          |
|     84 | u32     | sampling duration in microseconds, saturated at `u32` max |
|     88 | u64     | reserved, zero                                            |

Record:

| Offset | Type | Field                                     |
| -----: | ---- | ----------------------------------------- |
|      0 | u32  | stream-local actor index from the catalog |
|      4 | u32  | flags; reserved and zero in v1            |
|      8 | f64  | world X                                   |
|     16 | f64  | world Y                                   |
|     24 | f64  | world Z                                   |
|     32 | f32  | roll degrees                              |
|     36 | f32  | pitch degrees                             |
|     40 | f32  | yaw degrees                               |
|     44 | u32  | reserved, zero                            |

## Limits

- Record count ≤ 16,384
- Header length = 96 bytes
- Record length = 48 bytes
- Payload length = `recordCount * 48` ≤ 786,432 bytes
- Host incremental decoders must bound undecoded buffered bytes (TypeScript decoder default:
  one max packet plus 64 KiB slack). Excess input is discarded and counted as malformed before the
  decoder resumes seeking magic.

## Semantics

- Little-endian only.
- An empty non-reset packet (`recordCount = 0`, flag bit 0 clear) is a heartbeat/health sample.
- A reset packet (flag bit 0 set) invalidates its catalog revision. Hosts retain the last visible
  sample as stale, reacquire a complete catalog over Remote Control, then resume. Never apply a
  record whose session ID, revision, or actor index does not match the retained catalog.
- Sequence is session-local and monotonic for applied packets. Gaps are expected under
  latest-state-wins delivery and must be observable; they are not a decode error.
- A producer that replaces an unsent sparse packet must carry its changed indices forward until a
  packet containing them has been delivered to the transport. Replacing one independent delta with
  another would lose state and does not satisfy latest-state-wins semantics.
- Stream-local actor indices are compact aliases for one catalog revision only. They are never
  durable actor identity and must not be persisted into Review Sets.
- This binary stream is a local data plane. It never carries durable Map Review evidence. Remote
  Control remains the low-rate control plane for catalog negotiation, focus, and status.

## Fixtures

Binary fixtures under `fixtures/` cover valid two-record packets, fragmented concatenation,
heartbeat, reset, bad-magic resynchronization, unsupported version, oversized record count/payload,
mismatched payload length, and truncated input. Prefer regenerating them with the TypeScript
encoder in `@ue-shed/observatory` rather than editing offsets by hand.
