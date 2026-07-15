import { readFile } from "node:fs/promises";
import { deepStrictEqual } from "node:assert";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import {
	AuthoringApplyRequest,
	AuthoringApplyResult,
	AuthoringSaveRequest,
	AuthoringSaveResult,
	AuthoringTableList,
	AuthoringTableSnapshotV1,
	AuthoringTableSnapshotV2,
	makeAuthoringJsonSchema
} from "../src/authoring.js";

const contracts = [
	["v1", "table-snapshot", AuthoringTableSnapshotV1],
	["v2", "table-snapshot", AuthoringTableSnapshotV2],
	["v1", "table-list", AuthoringTableList],
	["v1", "apply-request", AuthoringApplyRequest],
	["v1", "apply-result", AuthoringApplyResult],
	["v1", "save-request", AuthoringSaveRequest],
	["v1", "save-result", AuthoringSaveResult]
] as const satisfies readonly (readonly ["v1" | "v2", string, Schema.Top])[];

for (const [version, name, contract] of contracts) {
	const path = fileURLToPath(
		new URL(`../contracts/authoring/${version}/${name}.schema.json`, import.meta.url)
	);
	const authoritative: unknown = JSON.parse(await readFile(path, "utf8"));
	const runtime = makeAuthoringJsonSchema(contract);
	try {
		deepStrictEqual(authoritative, runtime);
	} catch {
		throw new Error(
			`${version}/${name} runtime schema does not match the authoritative JSON Schema`
		);
	}
}
