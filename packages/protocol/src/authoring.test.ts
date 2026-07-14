import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSONSchema, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
	AuthoringApplyRequest,
	AuthoringApplyResult,
	AuthoringSaveRequest,
	AuthoringSaveResult,
	AuthoringTableSnapshot,
	decodeAuthoringTableSnapshot
} from "./authoring.js";

describe("authoring wire contract", () => {
	it("accepts recursive typed values and explicit unsupported evidence", () => {
		const snapshot = decodeAuthoringTableSnapshot({
			contract: { name: "unreal-authoring", version: { major: 1, minor: 0 } },
			authority: { kind: "project_files", packageName: "/Game/Fixture/DT_Test" },
			completeness: "partial",
			table: {
				kind: "data_table",
				objectPath: "/Game/Fixture/DT_Test.DT_Test",
				parentTables: [],
				rowStruct: "/Script/Fixture.Row",
				rows: [
					{
						id: "row:Alpha",
						name: "Alpha",
						fields: [
							{
								name: "Nested",
								typeName: "StructProperty",
								value: {
									kind: "struct",
									fields: [
										{
											name: "Opaque",
											typeName: "StructProperty",
											value: {
												byteSize: 8,
												kind: "unsupported",
												reason: "unsupported type"
											}
										}
									]
								}
							}
						]
					}
				]
			},
			diagnostics: []
		});

		expect(snapshot.table.rows[0]?.fields[0]?.value.kind).toBe("struct");
	});

	it("keeps the checked-in language-neutral schema derived from the runtime contract", async () => {
		const check = async (name: string, contract: Schema.Schema.Any) => {
			const path = fileURLToPath(
				new URL(`../contracts/authoring/v1/${name}.schema.json`, import.meta.url)
			);
			const checkedIn: unknown = JSON.parse(await readFile(path, "utf8"));
			const derived = JSONSchema.make(contract, { target: "jsonSchema2020-12" });
			expect(checkedIn, name).toEqual(derived);
		};
		for (const [name, contract] of [
			["table-snapshot", AuthoringTableSnapshot],
			["apply-request", AuthoringApplyRequest],
			["apply-result", AuthoringApplyResult],
			["save-request", AuthoringSaveRequest],
			["save-result", AuthoringSaveResult]
		] as const) {
			await check(name, contract);
		}
	});
});
