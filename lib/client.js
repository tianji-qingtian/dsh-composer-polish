window.__ModuleLoader__.load({
	id: "dsh-composer-polish",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.js
		/**
		* dsh-composer-polish — client half.
		*
		* A small ✨ button in the composer tool row (`conversation.input.right`, the
		* official seat for clickable things next to the send button). Clicking it
		* sends the current draft over the harness's built-in `commands` remote to
		* the host-side `/polish` command, then fills the polished text back into
		* the input box through `inputActions.setDraft` — the official public write
		* path. Images in the draft are never touched: only the text is replaced.
		*
		* UI text is localized through the harness `locale` service (zh + en).
		*/
		const inject = [
			"slots",
			"remote",
			"remote.commands",
			"locale"
		];
		const ID = "dsh-composer-polish";
		/** Hard draft cap, mirroring the host command's limit. */
		const MAX_DRAFT_LENGTH = 51200;
		const CSS = `
.cpol-btn { display: inline-flex; align-items: center; gap: 5px; height: 24px;
  border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit;
  border-radius: 999px; padding: 0 9px; font-size: 12px; line-height: 1;
  cursor: pointer; opacity: .75; white-space: nowrap; }
.cpol-btn:hover:not(:disabled) { opacity: 1; background: rgba(127,127,127,.12); }
.cpol-btn:disabled { opacity: .4; cursor: default; }
.cpol-glyph { font-size: 12px; line-height: 1; }
.cpol-spin { display: inline-block; width: 11px; height: 11px; flex: none;
  border: 1.5px solid currentColor; border-right-color: transparent;
  border-radius: 50%; opacity: .8; animation: cpol-rotate .8s linear infinite; }
@keyframes cpol-rotate { to { transform: rotate(360deg); } }
`;
		/** One <style data-plugin> tag per load; the loader removes plugin-owned tags on unload. */
		function injectStyle() {
			const tagId = `${ID}/button.css`;
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = ID;
				tag.dataset.pluginCss = tagId;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
		}
		const ZH = {
			"button.label": "润色",
			"button.title": "润色草稿：改写后自动回填输入框",
			"button.busy": "润色中…"
		};
		const EN = {
			"button.label": "Polish",
			"button.title": "Polish the draft: rewrites it and fills the result back into the composer",
			"button.busy": "Polishing…"
		};
		function apply(ctx) {
			injectStyle();
			let t = (key) => key;
			try {
				ctx.locale.register(ID, "zh", ZH);
				ctx.locale.register(ID, "en", EN);
				t = ctx.locale.bind(ID);
			} catch (error) {
				console.error("dsh-composer-polish: locale registration failed: " + String(error));
			}
			function PolishButton(props) {
				const input = props.useInput((s) => s);
				const inputActions = props.inputActions;
				const sessionId = props.sessionId ? String(props.sessionId) : "";
				const [busy, setBusy] = (0, react.useState)(false);
				const [, setLocaleTick] = (0, react.useState)(0);
				const inputRef = (0, react.useRef)(input);
				inputRef.current = input;
				(0, react.useEffect)(() => {
					return ctx.locale.subscribe(() => setLocaleTick((x) => x + 1));
				}, []);
				const draft = typeof input.draft === "string" ? input.draft : "";
				const hasText = draft.trim().length > 0;
				const disabled = busy || !hasText || sessionId === "";
				const onPolish = () => {
					if (disabled) return;
					const draftRev = input.draftRev;
					const payload = draft.length > MAX_DRAFT_LENGTH ? draft.slice(0, MAX_DRAFT_LENGTH) : draft;
					setBusy(true);
					ctx.remote.commands.execute(sessionId, "/polish " + payload).then((res) => {
						const value = res && res.ok ? res.value : null;
						const result = value && value.result ? value.result : null;
						if (result && result.kind === "success" && typeof result.text === "string" && result.text.trim().length > 0) {
							const current = inputRef.current;
							if (!current || current.draftRev !== draftRev) {
								console.log("dsh-composer-polish: draft changed during polish; result discarded");
								return;
							}
							inputActions.setDraft(result.text);
						} else console.error("dsh-composer-polish: polish command failed: " + JSON.stringify(res));
					}).catch((error) => {
						console.error("dsh-composer-polish: polish roundtrip failed: " + String(error));
					}).finally(() => setBusy(false));
				};
				return (0, react.createElement)("button", {
					type: "button",
					className: "cpol-btn",
					title: busy ? t("button.busy") : t("button.title"),
					disabled,
					onClick: onPolish
				}, busy ? (0, react.createElement)("span", {
					className: "cpol-spin",
					"aria-hidden": "true"
				}) : (0, react.createElement)("span", {
					className: "cpol-glyph",
					"aria-hidden": "true"
				}, "✨"), (0, react.createElement)("span", null, t("button.label")));
			}
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "composer-polish",
				order: 100,
				label: "Polish draft"
			}, (props) => (0, react.createElement)(PolishButton, props)));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map