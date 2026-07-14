import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSONSchema } from "effect";
import {
	AuthoringApplyRequest,
	AuthoringApplyResult,
	AuthoringSaveRequest,
	AuthoringSaveResult,
	AuthoringTableSnapshot
} from "../src/authoring.js";

const output = fileURLToPath(
	new URL("../contracts/authoring/v1/table-snapshot.schema.json", import.meta.url)
);
const schema = JSONSchema.make(AuthoringTableSnapshot, {
	target: "jsonSchema2020-12"
});

await writeFile(output, `${JSON.stringify(schema, null, "\t")}\n`, "utf8");

for (const [name, contract] of [
	["apply-request", AuthoringApplyRequest],
	["apply-result", AuthoringApplyResult],
	["save-request", AuthoringSaveRequest],
	["save-result", AuthoringSaveResult]
] as const) {
	const contractOutput = fileURLToPath(
		new URL(`../contracts/authoring/v1/${name}.schema.json`, import.meta.url)
	);
	await writeFile(
		contractOutput,
		`${JSON.stringify(JSONSchema.make(contract, { target: "jsonSchema2020-12" }), null, "\t")}\n`,
		"utf8"
	);
}
