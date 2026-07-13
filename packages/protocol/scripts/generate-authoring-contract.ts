import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSONSchema } from "effect";
import { AuthoringTableSnapshot } from "../src/authoring.js";

const output = fileURLToPath(
	new URL("../contracts/authoring/v1/table-snapshot.schema.json", import.meta.url)
);
const schema = JSONSchema.make(AuthoringTableSnapshot, {
	target: "jsonSchema2020-12"
});

await writeFile(output, `${JSON.stringify(schema, null, "\t")}\n`, "utf8");
