// Minimal tool registry executed within content script or via chrome.scripting.
// Tools provide side-effect actions (navigate, click, type, extractText, scroll).

export class ToolRegistry {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.tools = new Map();
    this._registerCore();
  }

  _registerCore() {
    this.register('navigate', async ({ url }) => {
      if (!url) throw new Error('navigate requires url');
      // Open in active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      await chrome.tabs.update(tab.id, { url });
      return { ok: true };
    });

    // Prefer messaging the content bridge if available; fallback to direct injection.
    this.register('extractText', async ({ selector = 'body' } = {}) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      const bridgeResp = await this._sendBridge(tab.id, 'extractText', { selector });
      if (bridgeResp) return bridgeResp.result;
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector],
        func: (sel) => {
          const el = document.querySelector(sel) || document.body;
          return (el.innerText || '').slice(0, 20000);
        }
      });
      return { text: result };
    });

    this.register('click', async ({ selector }) => {
      if (!selector) throw new Error('click requires selector');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const bridgeResp = await this._sendBridge(tab.id, 'click', { selector });
      if (bridgeResp) return bridgeResp.result;
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector],
        func: (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { ok: false, error: 'not found' };
          el.click();
          return { ok: true };
        }
      });
      return result;
    });

    this.register('type', async ({ selector, text }) => {
      if (!selector) throw new Error('type requires selector');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const bridgeResp = await this._sendBridge(tab.id, 'type', { selector, text });
      if (bridgeResp) return bridgeResp.result;
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector, text],
        func: (sel, txt) => {
          const el = document.querySelector(sel);
          if (!el) return { ok: false, error: 'not found' };
          if ('value' in el) { el.value = txt; el.dispatchEvent(new Event('input', { bubbles: true })); }
          return { ok: true };
        }
      });
      return result;
    });

    this.register('scroll', async ({ y = 400 }) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const bridgeResp = await this._sendBridge(tab.id, 'scroll', { y });
      if (bridgeResp) return bridgeResp.result;
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [y], func: (dy) => window.scrollBy(0, dy) });
      return { ok: true };
    });
  }

  register(name, fn) { if (this.tools.has(name)) throw new Error(`Tool already registered: ${name}`); this.tools.set(name, fn); }
  list() { return [...this.tools.keys()]; }
  async run(name, args) {
    const fn = this.tools.get(name); if (!fn) throw new Error(`Unknown tool: ${name}`); return await fn(args || {});
  }

  async _sendBridge(tabId, tool, args) {
    // Probe bridge with a short timeout; if not present, return null to fallback.
    const hasBridge = await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, 200);
      chrome.tabs.sendMessage(tabId, { kind: 'bridge.ping' }, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(resp && resp.ok && resp.bridge);
      });
    });
    if (!hasBridge) return null;
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { kind: 'toolExec', tool, args }, (resp) => {
        resolve(resp);
      });
    });
  }
}
