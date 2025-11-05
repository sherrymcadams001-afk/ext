(function(){
	"use strict";
	if (globalThis.__CONTENT_BRIDGE_INITIALIZED__) return;
	globalThis.__CONTENT_BRIDGE_INITIALIZED__ = true;
	const BRIDGE_VERSION = "0.1";

	const log = (...a) => console.log("[content-bridge]", ...a);
	log("initialized", BRIDGE_VERSION);

	// Firewall enforcement: read allow/deny lists from storage key 'firewall-settings'
	// Structure expected: { allowList: [], denyList: [], enabled: true }
	let __fwCache = null;
	function loadFirewallSettings() {
		return new Promise(resolve => {
			try {
				chrome.storage.local.get(['firewall-settings'], (res) => {
					const raw = res['firewall-settings'];
					if (!raw || typeof raw !== 'object') {
						__fwCache = { allowList: [], denyList: [], enabled: true };
						return resolve(__fwCache);
					}
					__fwCache = {
						allowList: Array.isArray(raw.allowList) ? raw.allowList : [],
						denyList: Array.isArray(raw.denyList) ? raw.denyList : [],
						enabled: raw.enabled !== false,
					};
					resolve(__fwCache);
				});
			} catch (e) {
				__fwCache = { allowList: [], denyList: [], enabled: true };
				resolve(__fwCache);
			}
		});
	}

	function normalizeHost(h) {
		return String(h || '').trim().toLowerCase().replace(/^www\./,'');
	}

	async function isAllowedHost() {
		try {
			const host = normalizeHost(location.hostname || '');
			if (!__fwCache) await loadFirewallSettings();
			const { allowList, denyList, enabled } = __fwCache || {};
			if (!enabled) return true;
			if (denyList.some(d => normalizeHost(d) === host)) return false;
			if (allowList.length === 0) return true; // no allowList: allow unless denied
			return allowList.some(a => normalizeHost(a) === host);
		} catch (_) {
			return true; // fail open to avoid deadlocking tools; logging could be added
		}
	}

	function sanitizeSelector(sel) {
		if (typeof sel !== 'string') return '';
		sel = sel.trim();
		if (sel.length > 400) sel = sel.slice(0, 400); // cap length
		return sel.replace(/\n+/g, ' ');
	}

	function extractText(args) {
		const selector = sanitizeSelector(args?.selector || 'body');
		const el = document.querySelector(selector);
		const text = el ? el.innerText || '' : '';
		return {
			selector,
			exists: !!el,
			text: text.slice(0, 20000),
			length: text.length
		};
	}

	function clickElement(args) {
		const selector = sanitizeSelector(args?.selector);
		if (!selector) throw new Error('click: selector missing');
		const el = document.querySelector(selector);
		if (!el) return { ok: false, error: 'not found', selector };
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		return { ok: true, selector };
	}

	function typeInto(args) {
		const selector = sanitizeSelector(args?.selector);
		const text = String(args?.text || '');
		if (!selector) throw new Error('type: selector missing');
		const el = document.querySelector(selector);
		if (!el) return { ok: false, error: 'not found', selector };
		el.focus();
		if ('value' in el) {
			el.value = text;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
		return { ok: true, selector, typed: text.length };
	}

	function scrollByAmount(args) {
		const y = Number(args?.y ?? 400);
		window.scrollBy({ top: y, left: 0, behavior: 'smooth' });
		return { ok: true, scrolled: y };
	}

	const DISPATCH = {
		extractText: extractText,
		click: clickElement,
		type: typeInto,
		scroll: scrollByAmount
	};

	chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (!msg) return;
		if (msg.kind === 'bridge.ping') {
			sendResponse({ ok: true, bridge: true, version: BRIDGE_VERSION });
			return true;
		}
		if (msg.kind !== 'toolExec') return; // ignore unrelated messages
		if (!isAllowedHost()) {
			sendResponse({ ok: false, error: 'host not allowed' });
			return true;
		}
		const { tool, args } = msg;
		const started = performance.now();
		Promise.resolve().then(() => {
			const fn = DISPATCH[tool];
			if (!fn) throw new Error(`unknown tool '${tool}'`);
			return fn(args || {});
		}).then(result => {
			sendResponse({ ok: true, tool, result, elapsedMs: Math.round(performance.now() - started) });
		}).catch(err => {
			sendResponse({ ok: false, tool, error: (err && err.message) || String(err), elapsedMs: Math.round(performance.now() - started) });
		});
		return true; // keep channel open for async
	});
})();
