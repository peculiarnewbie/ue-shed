import { Deferred, Effect, Ref } from "effect";
import { it } from "@effect/vitest";
import { expect } from "vitest";
import { installRuntimeDisposal, type BeforeQuitEvent } from "./electron-bootstrap.js";

it.effect("prevents repeated quit events until runtime disposal completes", () =>
	Effect.gen(function* () {
		const release = yield* Deferred.make<void>();
		const disposeCount = yield* Ref.make(0);
		let beforeQuit: ((event: BeforeQuitEvent) => void) | undefined;
		let quitCount = 0;
		const disposal = installRuntimeDisposal(
			{
				onBeforeQuit: (listener) => {
					beforeQuit = listener;
				},
				quit: () => {
					quitCount += 1;
				}
			},
			() =>
				Effect.runPromise(
					Ref.update(disposeCount, (count) => count + 1).pipe(
						Effect.andThen(Deferred.await(release))
					)
				)
		);

		const prevented: Array<boolean> = [];
		const emitBeforeQuit = () => {
			let value = false;
			beforeQuit?.({ preventDefault: () => (value = true) });
			prevented.push(value);
		};

		emitBeforeQuit();
		emitBeforeQuit();
		disposal.disposeAndQuit();
		expect(prevented).toEqual([true, true]);
		expect(yield* Ref.get(disposeCount)).toBe(1);
		expect(quitCount).toBe(0);

		yield* Deferred.succeed(release, undefined);
		for (let index = 0; index < 10; index += 1) yield* Effect.yieldNow;
		expect(quitCount).toBe(1);

		emitBeforeQuit();
		expect(prevented).toEqual([true, true, false]);
	})
);
