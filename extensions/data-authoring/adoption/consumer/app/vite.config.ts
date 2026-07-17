import stylexModule, { type PluginOptions } from "@stylexjs/rollup-plugin";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const stylex = stylexModule as unknown as (options: PluginOptions) => Plugin;

export default defineConfig(({ command }) => ({
	plugins: [
		solid(),
		stylex({ fileName: "stylex.css", runtimeInjection: command === "serve" }),
		{
			enforce: "post",
			name: "adopted-host-link-stylex",
			transformIndexHtml: () => [
				{
					attrs: { href: "/stylex.css", rel: "stylesheet" },
					tag: "link",
					injectTo: "head"
				}
			]
		}
	]
}));
