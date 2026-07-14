import * as stylex from "@stylexjs/stylex";
import type { AuthoringFieldValue, AuthoringRow, AuthoringTableSnapshot } from "@ue-shed/protocol";
import { For, Match, Show, Switch, createMemo, createSignal, onMount } from "solid-js";
import {
	fieldInRow,
	filterRows,
	formatAuthoringValue,
	tableColumns,
	valueSummary
} from "./authoring-view.js";

export interface AuthoringLoadFailure {
	readonly code: "reader_failure" | "contract_failure";
	readonly message: string;
	readonly recovery: string;
	readonly retrySafe: boolean;
}

export type AuthoringLoadResult =
	| { readonly status: "ready"; readonly snapshot: AuthoringTableSnapshot }
	| { readonly status: "not_configured" }
	| { readonly status: "cancelled" }
	| { readonly status: "failed"; readonly error: AuthoringLoadFailure };

export interface AuthoringClient {
	readonly loadConfiguredTable: () => Promise<AuthoringLoadResult>;
	readonly chooseTable: () => Promise<AuthoringLoadResult>;
}

type ViewState =
	| { readonly status: "loading" }
	| { readonly status: "not_configured" }
	| { readonly status: "cancelled" }
	| { readonly status: "failed"; readonly error: AuthoringLoadFailure }
	| { readonly status: "ready"; readonly snapshot: AuthoringTableSnapshot };

interface CellSelection {
	readonly rowId: string;
	readonly fieldName: string;
}

function shortObjectName(objectPath: string): string {
	return objectPath.slice(objectPath.lastIndexOf("/") + 1).split(".")[0] ?? objectPath;
}

function authorityLabel(snapshot: AuthoringTableSnapshot): string {
	return snapshot.authority.kind === "project_files" ? "SAVED PACKAGE" : "LIVE EDITOR";
}

function isTrue(field: AuthoringFieldValue): boolean {
	return field.value.kind === "bool" && field.value.value;
}

function CellValue(props: { readonly field: AuthoringFieldValue | undefined }) {
	return (
		<Show when={props.field} fallback={<span {...stylex.props(styles.missingValue)}>—</span>}>
			{(field) => (
				<>
					<Show when={field().value.kind === "bool"}>
						<span
							{...stylex.props(
								styles.booleanMark,
								isTrue(field()) && styles.booleanMarkTrue
							)}
						/>
					</Show>
					<span
						{...stylex.props(
							styles.cellText,
							field().value.kind === "unsupported" && styles.unsupportedText
						)}
					>
						{formatAuthoringValue(field().value)}
					</span>
				</>
			)}
		</Show>
	);
}

export function AuthoringRoute(props: { readonly client: AuthoringClient }) {
	const [state, setState] = createSignal<ViewState>({ status: "loading" });
	const [query, setQuery] = createSignal("");
	const [selection, setSelection] = createSignal<CellSelection>();

	const applyResult = (result: AuthoringLoadResult) => {
		if (result.status === "ready") {
			setState(result);
			const firstRow = result.snapshot.table.rows[0];
			const firstField = firstRow?.fields[0];
			setSelection(
				firstRow && firstField
					? { fieldName: firstField.name, rowId: firstRow.id }
					: undefined
			);
			return;
		}
		setState(result);
	};

	const load = async (choose: boolean) => {
		setState({ status: "loading" });
		applyResult(
			await (choose ? props.client.chooseTable() : props.client.loadConfiguredTable())
		);
	};

	onMount(() => void load(false));

	return (
		<main {...stylex.props(styles.page)}>
			<header {...stylex.props(styles.header)}>
				<div>
					<div {...stylex.props(styles.eyebrow)}>DATA AUTHORING / SAVED AUTHORITY</div>
					<h1 {...stylex.props(styles.title)}>Table ledger</h1>
					<p {...stylex.props(styles.subtitle)}>
						Typed DataTable evidence directly from the package. Unreal can stay closed.
					</p>
				</div>
				<div {...stylex.props(styles.headerActions)}>
					<button
						type="button"
						onClick={() => void load(true)}
						{...stylex.props(styles.primaryButton)}
					>
						Open saved table
					</button>
					<button
						type="button"
						onClick={() => void load(false)}
						{...stylex.props(styles.secondaryButton)}
					>
						Reload preset
					</button>
				</div>
			</header>

			<Switch>
				<Match when={state().status === "loading"}>
					<div {...stylex.props(styles.emptyState)}>
						<span {...stylex.props(styles.pulse)} /> Reading typed table snapshot…
					</div>
				</Match>
				<Match when={state().status === "not_configured"}>
					<div {...stylex.props(styles.emptyState)}>
						<strong>No authoring preset is configured.</strong>
						<span>Open any saved DataTable package to begin.</span>
						<button
							type="button"
							onClick={() => void load(true)}
							{...stylex.props(styles.inlineButton)}
						>
							Choose .uasset
						</button>
					</div>
				</Match>
				<Match when={state().status === "cancelled"}>
					<div {...stylex.props(styles.emptyState)}>
						Selection cancelled. The current table was not replaced.
					</div>
				</Match>
				<Match when={state().status === "failed"}>
					{(() => {
						const current = state();
						if (current.status !== "failed") return null;
						return (
							<div {...stylex.props(styles.errorState)}>
								<strong>{current.error.message}</strong>
								<span>{current.error.recovery}</span>
								<Show when={current.error.retrySafe}>
									<button
										type="button"
										onClick={() => void load(false)}
										{...stylex.props(styles.inlineButton)}
									>
										Retry
									</button>
								</Show>
							</div>
						);
					})()}
				</Match>
				<Match when={state().status === "ready"}>
					{(() => {
						const current = state();
						if (current.status !== "ready") return null;
						const snapshot = current.snapshot;
						const columns = tableColumns(snapshot);
						const visibleRows = createMemo(() =>
							filterRows(snapshot.table.rows, query())
						);
						const selected = createMemo(() => {
							const target = selection();
							if (!target) return undefined;
							const row = snapshot.table.rows.find(
								(item) => item.id === target.rowId
							);
							const field = row ? fieldInRow(row, target.fieldName) : undefined;
							return row && field ? { field, row } : undefined;
						});
						const gridTemplate = `minmax(180px, 0.8fr) repeat(${columns.length}, minmax(180px, 1fr))`;
						return (
							<div {...stylex.props(styles.workspace)}>
								<section
									{...stylex.props(styles.manifest)}
									aria-label="Table manifest"
								>
									<div {...stylex.props(styles.assetIdentity)}>
										<span {...stylex.props(styles.assetBadge)}>
											{authorityLabel(snapshot)}
										</span>
										<strong>
											{shortObjectName(snapshot.table.objectPath)}
										</strong>
										<small>{snapshot.table.objectPath}</small>
									</div>
									<div {...stylex.props(styles.metric)}>
										<strong>
											{String(snapshot.table.rows.length).padStart(2, "0")}
										</strong>
										<span>ROWS</span>
									</div>
									<div {...stylex.props(styles.metric)}>
										<strong>{String(columns.length).padStart(2, "0")}</strong>
										<span>FIELDS</span>
									</div>
									<div {...stylex.props(styles.metric)}>
										<strong>{snapshot.completeness.toUpperCase()}</strong>
										<span>SNAPSHOT</span>
									</div>
									<div {...stylex.props(styles.readOnlyFlag)}>
										<span>○</span>
										<div>
											<strong>READ ONLY</strong>
											<small>Draft editing is the next connected slice</small>
										</div>
									</div>
								</section>

								<Show when={snapshot.diagnostics.length > 0}>
									<section {...stylex.props(styles.diagnostics)}>
										<strong>
											{snapshot.diagnostics.length} PACKAGE DIAGNOSTICS
										</strong>
										<For each={snapshot.diagnostics}>
											{(diagnostic) => <span>{diagnostic.message}</span>}
										</For>
									</section>
								</Show>

								<div {...stylex.props(styles.contentGrid)}>
									<section {...stylex.props(styles.sheet)}>
										<div {...stylex.props(styles.sheetTools)}>
											<label {...stylex.props(styles.searchWrap)}>
												<span>FILTER</span>
												<input
													aria-label="Filter table rows"
													value={query()}
													onInput={(event) =>
														setQuery(event.currentTarget.value)
													}
													placeholder="Row names and values…"
													{...stylex.props(styles.search)}
												/>
											</label>
											<span {...stylex.props(styles.visibleCount)}>
												{visibleRows().length} /{" "}
												{snapshot.table.rows.length} VISIBLE
											</span>
											<span {...stylex.props(styles.rowStruct)}>
												ROW STRUCT · {snapshot.table.rowStruct}
											</span>
										</div>
										<div {...stylex.props(styles.tableScroll)}>
											<div
												{...stylex.props(styles.tableHeader)}
												style={{ "grid-template-columns": gridTemplate }}
											>
												<span>ROW NAME</span>
												<For each={columns}>
													{(column) => (
														<span
															{...stylex.props(styles.columnHeading)}
														>
															<strong>{column.name}</strong>
															<small>{column.typeName}</small>
														</span>
													)}
												</For>
											</div>
											<Show
												when={visibleRows().length > 0}
												fallback={
													<div {...stylex.props(styles.noRows)}>
														No rows match “{query()}”.
													</div>
												}
											>
												<For each={visibleRows()}>
													{(row: AuthoringRow) => (
														<div
															{...stylex.props(styles.tableRow)}
															style={{
																"grid-template-columns":
																	gridTemplate
															}}
														>
															<div {...stylex.props(styles.rowName)}>
																<span>
																	{row.name
																		.slice(0, 1)
																		.toUpperCase()}
																</span>
																<strong>{row.name}</strong>
															</div>
															<For each={columns}>
																{(column) => {
																	const field = fieldInRow(
																		row,
																		column.name
																	);
																	const active = () =>
																		selection()?.rowId ===
																			row.id &&
																		selection()?.fieldName ===
																			column.name;
																	return (
																		<button
																			type="button"
																			disabled={!field}
																			onClick={() =>
																				setSelection({
																					fieldName:
																						column.name,
																					rowId: row.id
																				})
																			}
																			{...stylex.props(
																				styles.tableCell,
																				active() &&
																					styles.tableCellActive
																			)}
																		>
																			<CellValue
																				field={field}
																			/>
																		</button>
																	);
																}}
															</For>
														</div>
													)}
												</For>
											</Show>
										</div>
									</section>

									<aside {...stylex.props(styles.inspector)}>
										<Show
											when={selected()}
											fallback={
												<div {...stylex.props(styles.inspectorEmpty)}>
													Select a typed cell to inspect its value.
												</div>
											}
										>
											{(target) => (
												<>
													<span {...stylex.props(styles.inspectorKicker)}>
														CELL EVIDENCE
													</span>
													<h2 {...stylex.props(styles.inspectorTitle)}>
														{target().field.name}
													</h2>
													<p {...stylex.props(styles.inspectorPath)}>
														{target().row.name} / {target().field.name}
													</p>
													<div {...stylex.props(styles.valueHero)}>
														<small>
															{valueSummary(
																target().field.value
															).toUpperCase()}
														</small>
														<strong>
															{formatAuthoringValue(
																target().field.value
															)}
														</strong>
													</div>
													<div {...stylex.props(styles.detailList)}>
														<div>
															<span>UNREAL TYPE</span>
															<strong>
																{target().field.typeName}
															</strong>
														</div>
														<div>
															<span>VALUE KIND</span>
															<strong>
																{target().field.value.kind}
															</strong>
														</div>
														<div>
															<span>ROW IDENTITY</span>
															<strong>{target().row.id}</strong>
														</div>
													</div>
													<div {...stylex.props(styles.nextSlice)}>
														<span>NEXT CAPABILITY</span>
														<strong>Persistent draft session</strong>
														<p>
															Editing will stage typed commands here
															before any live Apply or Save.
														</p>
													</div>
												</>
											)}
										</Show>
									</aside>
								</div>
							</div>
						);
					})()}
				</Match>
			</Switch>
		</main>
	);
}

const styles = stylex.create({
	page: {
		minHeight: "calc(100vh - 52px)",
		padding: "32px 36px 42px",
		color: "#e8ebe5",
		backgroundColor: "#0b0d0d",
		backgroundImage:
			"linear-gradient(90deg, #ffffff05 1px, transparent 1px), linear-gradient(#ffffff04 1px, transparent 1px)",
		backgroundSize: "32px 32px"
	},
	header: {
		display: "flex",
		alignItems: "end",
		justifyContent: "space-between",
		gap: 32,
		paddingBottom: 26
	},
	eyebrow: { color: "#8fa080", fontSize: 9, letterSpacing: ".18em", marginBottom: 10 },
	title: {
		margin: 0,
		fontFamily: "Georgia, serif",
		fontSize: 46,
		fontWeight: 400,
		letterSpacing: "-.035em"
	},
	subtitle: { margin: "8px 0 0", color: "#89938c", fontSize: 11, lineHeight: 1.6 },
	headerActions: { display: "flex", gap: 8 },
	primaryButton: {
		border: "1px solid #b7e26d",
		backgroundColor: { default: "#b7e26d", ":hover": "#caef88" },
		color: "#10140d",
		padding: "11px 16px",
		cursor: "pointer",
		fontSize: 10,
		fontWeight: 800,
		letterSpacing: ".08em",
		textTransform: "uppercase"
	},
	secondaryButton: {
		border: "1px solid #414843",
		backgroundColor: { default: "#141816", ":hover": "#202621" },
		color: "#c9cec7",
		padding: "11px 16px",
		cursor: "pointer",
		fontSize: 10,
		letterSpacing: ".08em",
		textTransform: "uppercase"
	},
	emptyState: {
		minHeight: 360,
		border: "1px solid #343a36",
		backgroundColor: "#111412",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		color: "#879088",
		fontSize: 11
	},
	errorState: {
		minHeight: 280,
		border: "1px solid #704a3c",
		backgroundColor: "#1b1210",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		color: "#d7a08b",
		fontSize: 11
	},
	inlineButton: {
		marginTop: 8,
		border: "1px solid #58614e",
		backgroundColor: { default: "transparent", ":hover": "#b7e26d14" },
		color: "#b7e26d",
		padding: "8px 12px",
		cursor: "pointer",
		fontSize: 9,
		letterSpacing: ".08em",
		textTransform: "uppercase"
	},
	pulse: {
		width: 8,
		height: 8,
		borderRadius: "50%",
		backgroundColor: "#b7e26d",
		boxShadow: "0 0 14px #b7e26d88"
	},
	workspace: { display: "flex", flexDirection: "column", gap: 10 },
	manifest: {
		display: "grid",
		gridTemplateColumns:
			"minmax(300px, 1.7fr) repeat(3, minmax(105px, .42fr)) minmax(220px, .8fr)",
		border: "1px solid #39403b",
		backgroundColor: "#111412"
	},
	assetIdentity: { display: "flex", flexDirection: "column", gap: 5, padding: "14px 16px" },
	assetBadge: { color: "#b7e26d", fontSize: 8, letterSpacing: ".14em" },
	metric: {
		display: "flex",
		flexDirection: "column",
		justifyContent: "center",
		padding: "10px 15px",
		borderLeft: "1px solid #303632",
		gap: 4
	},
	readOnlyFlag: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		padding: "10px 15px",
		borderLeft: "1px solid #303632",
		color: "#d6a363"
	},
	diagnostics: {
		display: "flex",
		gap: 16,
		padding: "10px 14px",
		border: "1px solid #665337",
		backgroundColor: "#1a1710",
		color: "#d6a363",
		fontSize: 9
	},
	contentGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 10 },
	sheet: { minWidth: 0, border: "1px solid #39403b", backgroundColor: "#101311" },
	sheetTools: {
		height: 48,
		display: "flex",
		alignItems: "center",
		gap: 16,
		padding: "0 12px",
		borderBottom: "1px solid #303632"
	},
	searchWrap: { display: "flex", alignItems: "center", gap: 9, color: "#707a72", fontSize: 8 },
	search: {
		width: 250,
		border: "1px solid #39413b",
		backgroundColor: "#090b0a",
		color: "#e0e5dd",
		padding: "8px 10px",
		outlineColor: "#b7e26d"
	},
	visibleCount: { color: "#89938c", fontSize: 8, letterSpacing: ".08em" },
	rowStruct: {
		marginLeft: "auto",
		maxWidth: 360,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: "#58615a",
		fontSize: 8
	},
	tableScroll: { maxHeight: "calc(100vh - 285px)", minHeight: 430, overflow: "auto" },
	tableHeader: {
		minWidth: "max-content",
		display: "grid",
		position: "sticky",
		top: 0,
		zIndex: 3,
		backgroundColor: "#171b18",
		borderBottom: "1px solid #465047",
		color: "#839087",
		fontSize: 8,
		letterSpacing: ".08em"
	},
	columnHeading: { display: "flex", flexDirection: "column", gap: 3 },
	tableRow: {
		minWidth: "max-content",
		display: "grid",
		borderBottom: "1px solid #262c28"
	},
	rowName: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 9,
		padding: "10px 12px",
		borderRight: "1px solid #303632",
		backgroundColor: "#141815",
		fontSize: 10
	},
	tableCell: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 7,
		border: 0,
		borderRight: "1px solid #282e2a",
		backgroundColor: { default: "transparent", ":hover": "#202720" },
		color: "#c3cac2",
		padding: "10px 12px",
		textAlign: "left",
		cursor: "pointer",
		overflow: "hidden"
	},
	tableCellActive: { backgroundColor: "#253020", boxShadow: "inset 0 0 0 1px #91bd65" },
	cellText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 },
	missingValue: { color: "#444b46" },
	unsupportedText: { color: "#d6a363" },
	booleanMark: { width: 7, height: 7, borderRadius: "50%", backgroundColor: "#59615b" },
	booleanMarkTrue: { backgroundColor: "#91c976", boxShadow: "0 0 7px #91c97666" },
	noRows: { padding: 40, textAlign: "center", color: "#6e766f", fontSize: 10 },
	inspector: {
		minHeight: 480,
		border: "1px solid #39403b",
		backgroundColor: "#111412",
		padding: 20,
		overflow: "hidden"
	},
	inspectorEmpty: { color: "#727a74", fontSize: 10, lineHeight: 1.6 },
	inspectorKicker: { color: "#8fa080", fontSize: 8, letterSpacing: ".15em" },
	inspectorTitle: {
		margin: "12px 0 5px",
		fontFamily: "Georgia, serif",
		fontSize: 28,
		fontWeight: 400
	},
	inspectorPath: { margin: 0, color: "#6f7871", fontSize: 9 },
	valueHero: {
		marginTop: 22,
		minHeight: 120,
		display: "flex",
		flexDirection: "column",
		justifyContent: "space-between",
		padding: 16,
		borderLeft: "3px solid #b7e26d",
		backgroundColor: "#0b0e0c",
		color: "#dfe4dc",
		wordBreak: "break-word"
	},
	detailList: { display: "flex", flexDirection: "column", gap: 0, marginTop: 18 },
	nextSlice: {
		marginTop: 24,
		paddingTop: 16,
		borderTop: "1px solid #333a35",
		color: "#7d877f",
		fontSize: 9,
		lineHeight: 1.6
	}
});
