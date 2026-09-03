// Classic script: MV3 content scripts cannot be ES modules, so the module
// graph is pulled in dynamically from web_accessible_resources.
(async () => {
  try {
    const url = chrome.runtime.getURL('src/main.js');
    const { start } = await import(url);
    start();
  } catch (error) {
    console.warn('[pomium] failed to start', error);
  }
})();
