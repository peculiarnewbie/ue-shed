import { Cause, Effect, Exit } from "effect";
import { CliRuntime, CliRuntimeLive, executeCommand } from "./application.js";
import { type CliUsageError, parseCliCommand } from "./command.js";

export type CliError = CliUsageError | import("./application.js").CliCommandError;

export function main(args: readonly string[]): Effect.Effect<void, CliError, CliRuntime> {
	return parseCliCommand(args).pipe(Effect.flatMap(executeCommand));
}

Effect.runPromiseExit(main(process.argv.slice(2)).pipe(Effect.provide(CliRuntimeLive))).then(
	(exit) => {
		if (Exit.isSuccess(exit)) return;
		const failure = Cause.findErrorOption(exit.cause);
		if (failure._tag === "Some") {
			process.stderr.write(`ue-shed: ${failure.value.message}\n`);
			process.exitCode = 2;
			return;
		}
		process.stderr.write(`${Cause.pretty(exit.cause)}\n`);
		process.exitCode = 1;
	}
);
