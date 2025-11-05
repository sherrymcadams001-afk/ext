const wrapChromeCall = (fn, context) => (...args) => new Promise((resolve, reject) => {
  try {
    fn.call(context, ...args, (result) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }

      resolve(result);
    });
  } catch (error) {
    reject(error);
  }
});

const Tabs = {
  create: wrapChromeCall(chrome.tabs.create, chrome.tabs),
  query: wrapChromeCall(chrome.tabs.query, chrome.tabs),
  sendMessage: wrapChromeCall(chrome.tabs.sendMessage, chrome.tabs),
  update: wrapChromeCall(chrome.tabs.update, chrome.tabs),
};

const Runtime = {
  sendMessage: wrapChromeCall(chrome.runtime.sendMessage, chrome.runtime),
};

export {
  Runtime,
  Tabs,
  wrapChromeCall,
};
