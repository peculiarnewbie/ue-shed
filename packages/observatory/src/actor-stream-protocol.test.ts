import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	ACTOR_STREAM_FLAG_RESET,
	ACTOR_STREAM_HEADER_BYTES,
	ACTOR_STREAM_MAX_BUFFERED_BYTES,
	ACTOR_STREAM_MAX_RECORDS,
	ACTOR_STREAM_RECORD_BYTES,
	ActorStreamDecoder,
	actorStreamPacketToTransformBatch,
	encodeActorStreamPacket,
	type ActorStreamRecord
} from "./actor-stream-protocol.js";

const sessionId = "0123456789abcdef0123456789abcdef";
const fixtureDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../protocol/contracts/observatory/v1/fixtures"
);

const twoRecords: ReadonlyArray<ActorStreamRecord> = [
	{
		flags: 0,
		location: { x: 10, y: -20, z: 30 },
		rotation: { pitch: 1.5, roll: 0.25, yaw: 90 },
		streamIndex: 0
	},
	{
		flags: 0,
		location: { x: 100, y: 200, z: 0 },
		rotation: { pitch: 0, roll: 0, yaw: 180 },
		streamIndex: 3
	}
];

function validPacket(args?: {
	readonly flags?: number;
	readonly records?: ReadonlyArray<ActorStreamRecord>;
	readonly sequence?: bigint;
}): Buffer {
	return encodeActorStreamPacket({
		catalogRevision: 7n,
		flags: args?.flags ?? 0,
		producerMonotonicMs: 1234.5,
		producerReplacements: 2,
		records: args?.records ?? twoRecords,
		samplingDurationMicros: 42,
		sequence: args?.sequence ?? 9n,
		sessionId,
		worldSeconds: 56.25
	});
}

function writeFixtures(): void {
	mkdirSync(fixtureDir, { recursive: true });
	const valid = validPacket();
	writeFileSync(join(fixtureDir, "two-records.bin"), valid);
	writeFileSync(
		join(fixtureDir, "fragmented-concat.bin"),
		Buffer.concat([validPacket({ sequence: 1n }), validPacket({ sequence: 2n })])
	);
	writeFileSync(join(fixtureDir, "heartbeat.bin"), validPacket({ records: [], sequence: 3n }));
	writeFileSync(
		join(fixtureDir, "reset.bin"),
		validPacket({ flags: ACTOR_STREAM_FLAG_RESET, records: [], sequence: 4n })
	);
	writeFileSync(
		join(fixtureDir, "bad-magic-then-valid.bin"),
		Buffer.concat([Buffer.from("XXXX"), validPacket({ sequence: 5n })])
	);
	writeFileSync(
		join(fixtureDir, "unsupported-version.bin"),
		encodeActorStreamPacket({
			catalogRevision: 1n,
			records: [],
			sequence: 1n,
			sessionId,
			version: 2
		})
	);
	writeFileSync(
		join(fixtureDir, "oversized-record-count.bin"),
		encodeActorStreamPacket({
			catalogRevision: 1n,
			corrupt: { recordCount: ACTOR_STREAM_MAX_RECORDS + 1, payloadLength: 0 },
			records: [],
			sequence: 1n,
			sessionId
		})
	);
	writeFileSync(
		join(fixtureDir, "mismatched-payload-length.bin"),
		encodeActorStreamPacket({
			catalogRevision: 1n,
			corrupt: { payloadLength: 24 },
			records: twoRecords.slice(0, 1),
			sequence: 1n,
			sessionId
		})
	);
	writeFileSync(
		join(fixtureDir, "truncated.bin"),
		valid.subarray(0, ACTOR_STREAM_HEADER_BYTES - 8)
	);
}

writeFixtures();

describe("actor stream protocol fixtures", () => {
	it("round-trips a valid two-record packet", () => {
		const bytes = readFileSync(join(fixtureDir, "two-records.bin"));
		const decoder = new ActorStreamDecoder();
		const { malformed, packets } = decoder.push(bytes);
		expect(malformed).toBe(0);
		expect(packets).toHaveLength(1);
		const packet = packets[0];
		expect(packet).toMatchObject({
			actorsChanged: 2,
			actorsSampled: 2,
			catalogRevision: 7n,
			producerReplacements: 2,
			reset: false,
			sequence: 9n,
			sessionId,
			worldSeconds: 56.25
		});
		expect(packet?.records).toEqual(twoRecords);
	});

	it("decodes fragmented concatenated packets", () => {
		const bytes = readFileSync(join(fixtureDir, "fragmented-concat.bin"));
		const decoder = new ActorStreamDecoder();
		const first = decoder.push(bytes.subarray(0, 40));
		expect(first.packets).toHaveLength(0);
		const second = decoder.push(bytes.subarray(40, 120));
		expect(second.packets.length).toBeGreaterThanOrEqual(0);
		const rest = decoder.push(bytes.subarray(120));
		const packets = [...second.packets, ...rest.packets];
		expect(packets.map((packet) => packet.sequence)).toEqual([1n, 2n]);
	});

	it("accepts heartbeat and reset packets", () => {
		const decoder = new ActorStreamDecoder();
		expect(
			decoder.push(readFileSync(join(fixtureDir, "heartbeat.bin"))).packets[0]
		).toMatchObject({
			records: [],
			reset: false,
			sequence: 3n
		});
		expect(decoder.push(readFileSync(join(fixtureDir, "reset.bin"))).packets[0]).toMatchObject({
			records: [],
			reset: true,
			sequence: 4n
		});
	});

	it("resynchronizes after bad magic onto a valid packet", () => {
		const decoder = new ActorStreamDecoder();
		const { malformed, packets } = decoder.push(
			readFileSync(join(fixtureDir, "bad-magic-then-valid.bin"))
		);
		expect(malformed).toBeGreaterThan(0);
		expect(packets).toHaveLength(1);
		expect(packets[0]?.sequence).toBe(5n);
	});

	it("rejects unsupported version, oversized counts, and mismatched payload length", () => {
		const decoder = new ActorStreamDecoder();
		for (const name of [
			"unsupported-version.bin",
			"oversized-record-count.bin",
			"mismatched-payload-length.bin"
		] as const) {
			const { malformed, packets } = decoder.push(readFileSync(join(fixtureDir, name)));
			expect(packets).toHaveLength(0);
			expect(malformed).toBeGreaterThan(0);
		}
	});

	it("waits on truncated input without allocating a payload", () => {
		const decoder = new ActorStreamDecoder();
		const { malformed, packets } = decoder.push(
			readFileSync(join(fixtureDir, "truncated.bin"))
		);
		expect(packets).toHaveLength(0);
		expect(malformed).toBe(0);
		expect(decoder.metrics().bufferedBytes).toBe(ACTOR_STREAM_HEADER_BYTES - 8);
	});

	it("rejects non-finite transform values before they reach the observation store", () => {
		const decoder = new ActorStreamDecoder();
		const { malformed, packets } = decoder.push(
			validPacket({
				records: [
					{
						...twoRecords[0]!,
						rotation: { ...twoRecords[0]!.rotation, pitch: Number.NaN }
					}
				]
			})
		);
		expect(packets).toHaveLength(0);
		expect(malformed).toBe(1);
	});
});

describe("actor stream decoder limits", () => {
	it("caps record count and payload before reading records", () => {
		const decoder = new ActorStreamDecoder();
		const oversized = encodeActorStreamPacket({
			catalogRevision: 1n,
			corrupt: {
				payloadLength: ACTOR_STREAM_MAX_RECORDS * ACTOR_STREAM_RECORD_BYTES,
				recordCount: ACTOR_STREAM_MAX_RECORDS + 1
			},
			records: [],
			sequence: 1n,
			sessionId
		});
		const { malformed, packets } = decoder.push(oversized);
		expect(packets).toHaveLength(0);
		expect(malformed).toBeGreaterThan(0);
	});

	it("bounds undecoded buffered bytes", () => {
		const decoder = new ActorStreamDecoder();
		const noise = Buffer.alloc(ACTOR_STREAM_MAX_BUFFERED_BYTES + 64, 0xab);
		decoder.push(noise);
		expect(decoder.metrics().bufferedBytes).toBeLessThanOrEqual(
			ACTOR_STREAM_MAX_BUFFERED_BYTES
		);
		expect(decoder.metrics().malformed).toBeGreaterThan(0);
	});

	it("maps decoded packets into transform batches without metadata strings", () => {
		const decoder = new ActorStreamDecoder();
		const packet = decoder.push(validPacket()).packets[0];
		expect(packet).toBeDefined();
		if (packet === undefined) return;
		const batch = actorStreamPacketToTransformBatch(packet);
		expect(batch.sessionId).toBe(sessionId);
		expect(batch.revision).toBe(7n);
		expect(batch.transforms[1]?.transform.rotation).toEqual({ x: 0, y: 0, z: 180 });
	});
});
