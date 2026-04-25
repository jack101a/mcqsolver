chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-autofill") {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      // Ensure we have a tab and it's a web page
      if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith("chrome://")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "forceRun" })
          .catch(err => console.log("Content script not ready on this tab"));
      }
    });
  }
});