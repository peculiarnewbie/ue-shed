import * as stylex from "@stylexjs/stylex";
import type {
	AuthoringCatalogResult,
	AuthoringLoadFailure,
	AuthoringLoadResult,
	AuthoringSessionResult,
	AuthoringSessionView,
	AuthoringSetCellsIntent
} from "@ue-shed/authoring-sdk";
import type { AuthoringFieldValue, AuthoringRow, AuthoringTableSnapshot } from "@ue-shed/protocol";
import { Button, PageHeader } from "@ue-shed/ui";
import { tokens } from "@ue-shed/ui-theme/tokens.stylex.js";
import { For, Match, Show, Switch, createMemo, createSignal, onMount } from "solid-js";
import {
	fieldInRow,
	filterRows,
	formatAuthoringValue,
	tableColumns,
	valueSummary
} from "./authoring-view.js";
import { AuthoringTableGrid } from "./authoring-table-grid.js";

export type {
	AuthoringCatalogResult,
	AuthoringLoadFailure,
	AuthoringLoadResult,
	AuthoringTableCatalogEntry
} from "@ue-shed/authoring-sdk";

export interface AuthoringClient {
	readonly loadConfiguredCatalog: () => Promise<AuthoringCatalogResult>;
	readonly loadConfiguredTable: () => Promise<AuthoringLoadResult>;
	readonly openCatalogTable: (objectPath: string) => Promise<AuthoringLoadResult>;
	readonly chooseTable: () => Promise<AuthoringLoadResult>;
	readonly beginSession: (objectPath: string) => Promise<AuthoringSessionResult>;
	readonly editSession: (intent: AuthoringSetCellsIntent) => Promise<AuthoringSessionResult>;
	readonly undoSession: (sessionId: string) => Promise<AuthoringSessionResult>;
	readonly redoSession: (sessionId: string) => Promise<AuthoringSessionResult>;
	readonly applySession: (sessionId: string) => Promise<AuthoringSessionResult>;
	readonly reconcileSession: (sessionId: string) => Promise<AuthoringSessionResult>;
	readonly saveSession: (sessionId: string) => Promise<AuthoringSessionResult>;
}

type ViewState =
	| { readonly status: "loading" }
	| { readonly status: "not_configured" }
	| { readonly status: "cancelled" }
	| { readonly status: "failed"; readonly error: AuthoringLoadFailure }
	| { readonly status: "ready"; readonly snapshot: AuthoringTableSnapshot };

type CatalogState = AuthoringCatalogResult | { readonly status: "loading" };

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

function CatalogPanel(props: {
	readonly activeObjectPath?: string;
	readonly disabled: boolean;
	readonly onOpen: (objectPath: string) => void;
	readonly onQueryChange: (query: string) => void;
	readonly onRefresh: () => void;
	readonly query: string;
	readonly state: CatalogState;
}) {
	const tables = createMemo(() => {
		if (props.state.status !== "ready") return [];
		const filter = props.query.trim().toLocaleLowerCase();
		return filter.length === 0
			? props.state.tables
			: props.state.tables.filter(
					(table) =>
						table.objectPath.toLocaleLowerCase().includes(filter) ||
						table.rowStruct.toLocaleLowerCase().includes(filter)
				);
	});

	return (
		<nav {...stylex.props(styles.catalog)} aria-label="Project DataTables">
			<div {...stylex.props(styles.catalogHeading)}>
				<div {...stylex.props(styles.catalogTitle)}>
					<span {...stylex.props(styles.catalogEyebrow)}>PROJECT INDEX</span>
					<strong {...stylex.props(styles.catalogName)}>Tables</strong>
				</div>
				<button
					type="button"
					disabled={props.disabled}
					onClick={props.onRefresh}
					aria-label="Refresh project DataTables"
					{...stylex.props(styles.catalogRefresh)}
				>
					↻
				</button>
			</div>
			<input
				aria-label="Filter project DataTables"
				placeholder="Filter tables…"
				value={props.query}
				onInput={(event) => props.onQueryChange(event.currentTarget.value)}
				{...stylex.props(styles.catalogSearch)}
			/>
			<Switch>
				<Match when={props.state.status === "loading"}>
					<div {...stylex.props(styles.catalogStatus)}>Scanning packages…</div>
				</Match>
				<Match when={props.state.status === "not_configured"}>
					<div {...stylex.props(styles.catalogStatus)}>
						Configure UE_SHED_PROJECT_ROOT to discover tables.
					</div>
				</Match>
				<Match when={props.state.status === "failed"}>
					<div {...stylex.props(styles.catalogStatus)}>
						Catalog unavailable. The open table is unchanged.
					</div>
				</Match>
				<Match when={props.state.status === "ready"}>
					<div {...stylex.props(styles.catalogList)}>
						<Show
							when={
								props.state.status === "ready" && props.state.diagnostics.length > 0
							}
						>
							<div {...stylex.props(styles.catalogWarning)}>
								{props.state.status === "ready"
									? `${props.state.diagnostics.length} catalog diagnostic${props.state.diagnostics.length === 1 ? "" : "s"}`
									: ""}
							</div>
						</Show>
						<For each={tables()}>
							{(table) => (
								<button
									type="button"
									disabled={props.disabled}
									onClick={() => props.onOpen(table.objectPath)}
									{...stylex.props(
										styles.catalogItem,
										table.objectPath === props.activeObjectPath &&
											styles.catalogItemActive
									)}
								>
									<span {...stylex.props(styles.catalogItemName)}>
										{shortObjectName(table.objectPath)}
									</span>
									<small {...stylex.props(styles.catalogItemKind)}>
										{table.kind === "composite_data_table"
											? "COMPOSITE"
											: "DATA TABLE"}
										{" · "}
										{table.authorities.join("+").toUpperCase()}
									</small>
									<Show when={table.divergence.length > 0}>
										<small {...stylex.props(styles.catalogDivergence)}>
											DIVERGED · {table.divergence.join(", ")}
										</small>
									</Show>
								</button>
							)}
						</For>
						<Show when={tables().length === 0}>
							<div {...stylex.props(styles.catalogStatus)}>No matching tables.</div>
						</Show>
					</div>
				</Match>
			</Switch>
		</nav>
	);
}

export function AuthoringRoute(props: { readonly client: AuthoringClient }) {
	const [state, setState] = createSignal<ViewState>({ status: "loading" });
	const [catalogState, setCatalogState] = createSignal<CatalogState>({ status: "loading" });
	const [catalogQuery, setCatalogQuery] = createSignal("");
	const [isReplacing, setIsReplacing] = createSignal(false);
	const [replacementNotice, setReplacementNotice] = createSignal<string>();
	const [query, setQuery] = createSignal("");
	const [selection, setSelection] = createSignal<CellSelection>();
	const [session, setSession] = createSignal<AuthoringSessionView>();
	const [sessionNotice, setSessionNotice] = createSignal<string>();
	const [isPersisting, setIsPersisting] = createSignal(false);

	const acceptSessionResult = (result: AuthoringSessionResult) => {
		if (result.status === "failed") {
			setSessionNotice(`${result.error.message} ${result.error.recovery}`);
			return;
		}
		setSession(result.view);
		setState({ snapshot: result.view.snapshot, status: "ready" });
		setSessionNotice(undefined);
	};

	const beginSession = async (objectPath: string) => {
		setSession(undefined);
		setSessionNotice(undefined);
		acceptSessionResult(await props.client.beginSession(objectPath));
	};

	const applyResult = (result: AuthoringLoadResult, preserveCurrent: boolean) => {
		if (result.status === "ready") {
			setState(result);
			setReplacementNotice(undefined);
			const firstRow = result.snapshot.table.rows[0];
			const firstField = firstRow?.fields[0];
			setSelection(
				firstRow && firstField
					? { fieldName: firstField.name, rowId: firstRow.id }
					: undefined
			);
			void beginSession(result.snapshot.table.objectPath);
			return;
		}
		if (preserveCurrent) {
			if (result.status === "failed") setReplacementNotice(result.error.message);
			else if (result.status === "cancelled")
				setReplacementNotice("Table selection cancelled.");
			return;
		}
		setState(result);
	};

	const load = async (choose: boolean) => {
		const preserveCurrent = state().status === "ready";
		if (preserveCurrent) setIsReplacing(true);
		else setState({ status: "loading" });
		try {
			applyResult(
				await (choose ? props.client.chooseTable() : props.client.loadConfiguredTable()),
				preserveCurrent
			);
		} finally {
			setIsReplacing(false);
		}
	};

	const loadCatalog = async () => {
		setCatalogState({ status: "loading" });
		setCatalogState(await props.client.loadConfiguredCatalog());
	};

	const openCatalogTable = async (objectPath: string) => {
		setIsReplacing(true);
		try {
			applyResult(
				await props.client.openCatalogTable(objectPath),
				state().status === "ready"
			);
		} finally {
			setIsReplacing(false);
		}
	};

	onMount(() => {
		void load(false);
		void loadCatalog();
	});

	return (
		<main {...stylex.props(styles.page)}>
			<PageHeader
				eyebrow="DATA AUTHORING / SAVED + LIVE AUTHORITY"
				title="Table ledger"
				description="Typed DataTable evidence with durable staged edits."
				actions={
					<>
						<Button
							type="button"
							tone="primary"
							disabled={isReplacing()}
							onClick={() => void load(true)}
						>
							{isReplacing() ? "Opening…" : "Open saved table"}
						</Button>
						<Button
							type="button"
							disabled={isReplacing()}
							onClick={() => void load(false)}
						>
							Reload preset
						</Button>
					</>
				}
			/>

			<Switch>
				<Match when={state().status === "loading"}>
					<div {...stylex.props(styles.emptyState)}>
						<span {...stylex.props(styles.pulse)} /> Reading typed table snapshot…
					</div>
				</Match>
				<Match when={state().status === "not_configured"}>
					<div {...stylex.props(styles.coldStart)}>
						<CatalogPanel
							disabled={isReplacing()}
							onOpen={(objectPath) => void openCatalogTable(objectPath)}
							onQueryChange={setCatalogQuery}
							onRefresh={() => void loadCatalog()}
							query={catalogQuery()}
							state={catalogState()}
						/>
						<div {...stylex.props(styles.emptyState)}>
							<strong>Select a project DataTable.</strong>
							<span>
								Choose from the project index or open a package outside the
								configured root.
							</span>
							<button
								type="button"
								onClick={() => void load(true)}
								{...stylex.props(styles.inlineButton)}
							>
								Choose .uasset
							</button>
						</div>
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

								<Show when={replacementNotice()}>
									<div {...stylex.props(styles.replacementNotice)}>
										<span>{replacementNotice()}</span>
										<button
											type="button"
											onClick={() => setReplacementNotice(undefined)}
											{...stylex.props(styles.noticeDismiss)}
										>
											Dismiss
										</button>
									</div>
								</Show>
								<Show when={sessionNotice()}>
									<div {...stylex.props(styles.replacementNotice)}>
										<span>{sessionNotice()}</span>
									</div>
								</Show>

								<div {...stylex.props(styles.contentGrid)}>
									<CatalogPanel
										activeObjectPath={snapshot.table.objectPath}
										disabled={isReplacing()}
										onOpen={(objectPath) => void openCatalogTable(objectPath)}
										onQueryChange={setCatalogQuery}
										onRefresh={() => void loadCatalog()}
										query={catalogQuery()}
										state={catalogState()}
									/>
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
											<Show when={session()}>
												{(currentSession) => (
													<>
														<button
															type="button"
															disabled={
																!currentSession().canUndo ||
																isPersisting()
															}
															onClick={async () => {
																setIsPersisting(true);
																try {
																	acceptSessionResult(
																		await props.client.undoSession(
																			currentSession()
																				.sessionId
																		)
																	);
																} finally {
																	setIsPersisting(false);
																}
															}}
															{...stylex.props(styles.sheetAction)}
														>
															Undo
														</button>
														<button
															type="button"
															disabled={
																!currentSession().canRedo ||
																isPersisting()
															}
															onClick={async () => {
																setIsPersisting(true);
																try {
																	acceptSessionResult(
																		await props.client.redoSession(
																			currentSession()
																				.sessionId
																		)
																	);
																} finally {
																	setIsPersisting(false);
																}
															}}
															{...stylex.props(styles.sheetAction)}
														>
															Redo
														</button>
														<Show
															when={(() => {
																const pipeline =
																	currentSession().pipeline;
																return (
																	pipeline.kind === "draft" &&
																	pipeline.canApply
																);
															})()}
														>
															<Button
																disabled={isPersisting()}
																onClick={async () => {
																	if (
																		!window.confirm(
																			`Apply ${currentSession().commandCount} staged command(s) to the live editor? This does not save packages.`
																		)
																	)
																		return;
																	setIsPersisting(true);
																	try {
																		acceptSessionResult(
																			await props.client.applySession(
																				currentSession()
																					.sessionId
																			)
																		);
																	} finally {
																		setIsPersisting(false);
																	}
																}}
															>
																Apply
															</Button>
														</Show>
														<Show
															when={(() => {
																const pipeline =
																	currentSession().pipeline;
																return (
																	pipeline.kind ===
																		"indeterminate" &&
																	pipeline.operation === "apply"
																);
															})()}
														>
															<Button
																disabled={isPersisting()}
																onClick={async () => {
																	setIsPersisting(true);
																	try {
																		acceptSessionResult(
																			await props.client.reconcileSession(
																				currentSession()
																					.sessionId
																			)
																		);
																	} finally {
																		setIsPersisting(false);
																	}
																}}
															>
																Reconcile Apply
															</Button>
														</Show>
														<Show
															when={(() => {
																const pipeline =
																	currentSession().pipeline;
																return (
																	pipeline.kind === "applied" ||
																	(pipeline.kind ===
																		"indeterminate" &&
																		pipeline.operation ===
																			"save")
																);
															})()}
														>
															<Button
																disabled={isPersisting()}
																onClick={async () => {
																	setIsPersisting(true);
																	try {
																		acceptSessionResult(
																			await props.client.saveSession(
																				currentSession()
																					.sessionId
																			)
																		);
																	} finally {
																		setIsPersisting(false);
																	}
																}}
															>
																Save packages
															</Button>
														</Show>
													</>
												)}
											</Show>
										</div>
										<AuthoringTableGrid
											columns={columns}
											disabled={!session() || isPersisting()}
											onEditFailure={setSessionNotice}
											onEditGesture={async (edits) => {
												const currentSession = session();
												if (!currentSession) return;
												setIsPersisting(true);
												try {
													acceptSessionResult(
														await props.client.editSession({
															edits,
															kind: "set_cells",
															sessionId: currentSession.sessionId,
															tableObjectPath:
																snapshot.table.objectPath
														})
													);
												} finally {
													setIsPersisting(false);
												}
											}}
											onSelectionChange={setSelection}
											rows={visibleRows()}
										/>
										<Show when={false}>
											<div {...stylex.props(styles.tableScroll)}>
												<div
													{...stylex.props(styles.tableHeader)}
													style={{
														"grid-template-columns": gridTemplate
													}}
												>
													<span>ROW NAME</span>
													<For each={columns}>
														{(column) => (
															<span
																{...stylex.props(
																	styles.columnHeading
																)}
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
																<div
																	{...stylex.props(
																		styles.rowName
																	)}
																>
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
																			selection()
																				?.fieldName ===
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
										</Show>
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
		color: tokens.colorText,
		backgroundColor: tokens.colorCanvas,
		backgroundImage:
			"linear-gradient(90deg, #ffffff05 1px, transparent 1px), linear-gradient(#ffffff04 1px, transparent 1px)",
		backgroundSize: "32px 32px"
	},
	coldStart: {
		display: "grid",
		gridTemplateColumns: "230px minmax(0, 1fr)",
		gap: 10
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
	replacementNotice: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "9px 12px",
		border: "1px solid #665337",
		backgroundColor: "#1a1710",
		color: "#d6a363",
		fontSize: 9
	},
	noticeDismiss: {
		border: 0,
		backgroundColor: "transparent",
		color: "#d6a363",
		cursor: "pointer",
		fontSize: 8,
		letterSpacing: ".08em",
		textTransform: "uppercase"
	},
	contentGrid: {
		display: "grid",
		gridTemplateColumns: "230px minmax(0, 1fr) 300px",
		gap: 10
	},
	catalog: {
		minHeight: 480,
		border: "1px solid #39403b",
		backgroundColor: "#0e110f",
		overflow: "hidden"
	},
	catalogHeading: {
		height: 58,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "0 12px",
		borderBottom: "1px solid #303632"
	},
	catalogTitle: { display: "flex", flexDirection: "column", gap: 4 },
	catalogEyebrow: { color: "#718073", fontSize: 7, letterSpacing: ".14em" },
	catalogName: { color: "#d9ded7", fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 400 },
	catalogRefresh: {
		width: 28,
		height: 28,
		border: "1px solid #39413b",
		backgroundColor: { default: "transparent", ":hover": "#202720" },
		color: "#9dab9e",
		cursor: "pointer"
	},
	catalogSearch: {
		width: "calc(100% - 20px)",
		margin: 10,
		border: "1px solid #343b36",
		backgroundColor: "#090b0a",
		color: "#e0e5dd",
		padding: "8px 9px",
		outlineColor: "#b7e26d",
		fontSize: 9
	},
	catalogStatus: { padding: 14, color: "#737d75", fontSize: 9, lineHeight: 1.6 },
	catalogList: {
		maxHeight: "calc(100vh - 350px)",
		overflowY: "auto",
		borderTop: "1px solid #252b27"
	},
	catalogItem: {
		width: "100%",
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-start",
		gap: 5,
		border: 0,
		borderBottom: "1px solid #252b27",
		borderLeft: "3px solid transparent",
		backgroundColor: { default: "transparent", ":hover": "#171d18" },
		color: "#b8c0b8",
		padding: "11px 10px",
		textAlign: "left",
		cursor: "pointer",
		fontSize: 10
	},
	catalogItemActive: { borderLeftColor: "#b7e26d", backgroundColor: "#1b241a" },
	catalogItemName: {
		width: "100%",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	},
	catalogItemKind: { color: "#68736a", fontSize: 7, letterSpacing: ".1em" },
	catalogDivergence: {
		color: "#d6a363",
		fontSize: 7,
		letterSpacing: ".08em",
		textTransform: "uppercase"
	},
	catalogWarning: {
		borderBottom: "1px solid #665337",
		backgroundColor: "#1a1710",
		color: "#d6a363",
		fontSize: 7,
		letterSpacing: ".08em",
		padding: "8px 10px",
		textTransform: "uppercase"
	},
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
	sheetAction: {
		border: "1px solid #39413b",
		backgroundColor: { default: "#111512", ":hover": "#202720" },
		color: "#aeb9af",
		cursor: "pointer",
		fontSize: 8,
		padding: "6px 9px",
		textTransform: "uppercase"
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
		borderColor: tokens.colorBorderStrong,
		borderStyle: "solid",
		borderWidth: 1,
		backgroundColor: tokens.colorSurface,
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
