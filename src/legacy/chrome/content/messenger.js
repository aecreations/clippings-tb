/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

Services.scriptloader.loadSubScript("chrome://clippings/content/tbMessengerOverlay.js",
				    window, "UTF-8");


let gClippingsMxListener = function () {
  let _clippings = WL.messenger.extension.getBackgroundPage();
  let _showLegacyDataMigrnStatus = false;

  return {
    clippingsManagerWndOpened()
    {
      if (_showLegacyDataMigrnStatus) {
	_clippings.openMigrationStatusDlg();
      }
      else {
	_clippings.openClippingsManager(false);
      }
    },

    legacyDataMigrationVerified()
    {
      let prefs = _clippings.getPrefs();

      if (! prefs.showLegacyDataMigrnStatus) {
	return;
      }
      
      let statusbarBtn = document.getElementById("ae-clippings-icon");

      let legacyDataMigrnSuccess = prefs.legacyDataMigrnSuccess;

      if (legacyDataMigrnSuccess) {
	if (prefs.showLegacyDataMigrnStatus) {
	  statusbarBtn.className = "migration-success";
	  _showLegacyDataMigrnStatus = true;
	  _clippings.setPrefs({ showLegacyDataMigrnStatus: false });
	}
      }
      else {
	statusbarBtn.className = "migration-error";
	statusbarBtn.setAttribute("tooltiptext", WL.extension.localeData.localizeMessage("migrnFailTtip"));
      }
    }
  };
}();


function onLoad(aActivatedWhileWindowOpen)
{
  // Logging to the console doesn't seem to be working anymore.
  aeUtils.log("Clippings/mx::messenger.js: Starting Clippings for Thunderbird from main three-pane window.");

  WL.injectCSS("chrome://clippings/content/style/overlay.css");
  
  // Place the status bar icon so that it appears as the last item, before
  // the window resizer grippy
  let statusBar = document.getElementById("status-bar");
  let statusbarpanel = document.createXULElement("hbox");
  statusbarpanel.id = "ae-clippings-status";
  statusbarpanel.className = "statusbarpanel";
  let statusbarBtn = document.createXULElement("toolbarbutton");
  statusbarBtn.id = "ae-clippings-icon";
  statusbarBtn.setAttribute("context", "ae-clippings-popup");
  statusbarBtn.setAttribute("tooltiptext", WL.extension.localeData.localizeMessage("browserActionTitle"));

  statusbarBtn.addEventListener("command", aEvent => {
    window.aecreations.clippings.openClippingsManager();
  });

  statusbarpanel.appendChild(statusbarBtn);
  statusBar.insertBefore(statusbarpanel, statusBar.lastChild);

  window.aecreations.clippings.addMxListener(gClippingsMxListener);
  window.aecreations.clippings.initClippings();
}


function onUnload(aDeactivatedWhileWindowOpen)
{
  // Cleaning up the window UI is only needed when the
  // add-on is being deactivated/removed while the window
  // is still open. It can be skipped otherwise.
  if (! aDeactivatedWhileWindowOpen) {
    return;
  }

  let statusbarpanel = document.getElementById("ae-clippings-status");
  statusbarpanel.parentNode.removeChild(statusbarpanel);
  
  window.aecreations.clippings.removeMxListener();

  delete window.aecreations.clippings;
  if (Object.keys(window.aecreations).length == 0) {
    delete window.aecreations;
  }
}
