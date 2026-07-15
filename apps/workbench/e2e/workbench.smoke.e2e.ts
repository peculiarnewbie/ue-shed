import { expect, test } from "./fixtures/workbench-test.js";

test("launches the configured showcase and opens a saved DataTable", async ({ workbench }) => {
	await workbench.expectShowcaseReady();
	await workbench.openRoute("Data Authoring");

	await expect(workbench.page.getByRole("heading", { name: "Table ledger" })).toBeVisible();
	await expect(
		workbench.page.getByRole("navigation", { name: "Project DataTables" })
	).toBeVisible();
	await expect(
		workbench.page.getByText("/Game/Fixture/Authoring/DT_Scalars.DT_Scalars", { exact: true })
	).toBeVisible();
	await expect(workbench.page.getByText("Scalar_Alpha / Enabled", { exact: true })).toBeVisible();
});
