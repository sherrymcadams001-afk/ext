// Stealth injection script for making Nanobrowser undetectable
const stealthScript = `
(function() {
  'use strict';
  
  // 1. Remove WebDriver property
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true
  });
  
  // 2. Mock navigator properties
  Object.defineProperty(navigator, 'plugins', {
    get: () => [
      { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' }
    ],
  });
  
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });
  
  // 3. Override chrome runtime
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.onConnect) {
    delete window.chrome.runtime.onConnect;
    delete window.chrome.runtime.onMessage;
  }
  
  // 4. Remove automation indicators
  delete window.__webdriver_evaluate;
  delete window.__selenium_evaluate;
  delete window.__webdriver_script_function;
  delete window.__webdriver_script_func;
  delete window.__webdriver_script_fn;
  delete window.__fxdriver_evaluate;
  delete window.__driver_unwrapped;
  delete window.__webdriver_unwrapped;
  delete window.__driver_evaluate;
  delete window.__selenium_unwrapped;
  delete window.__fxdriver_unwrapped;
  
  // 5. Mock screen properties with realistic values
  Object.defineProperty(screen, 'width', { get: () => 1920 });
  Object.defineProperty(screen, 'height', { get: () => 1080 });
  Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
  Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
  
  // 6. Override permissions API
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
      Promise.resolve({ state: Notification.permission }) :
      originalQuery(parameters)
  );
  
  // 7. Add realistic user interaction timestamps
  let lastInteraction = Date.now();
  ['click', 'keydown', 'keyup', 'mousemove'].forEach(event => {
    document.addEventListener(event, () => {
      lastInteraction = Date.now();
    }, true);
  });
  
  // 8. Override getComputedStyle to hide automation
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(element, pseudoElement) {
    const style = originalGetComputedStyle.call(this, element, pseudoElement);
    if (element && element.tagName === 'IFRAME') {
      style.display = 'block';
    }
    return style;
  };
  
})();`;

// Function to inject stealth script into page
function injectStealthScript(page) {
  return page.evaluateOnNewDocument(stealthScript);
}

module.exports = { injectStealthScript, stealthScript };