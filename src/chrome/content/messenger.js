/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
let {aeString} = ChromeUtils.import("resource://clippings/modules/aeString.js");
let {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
//let {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
//let {aeCreateClippingHelper} = ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js");

Services.scriptloader.loadSubScript("chrome://clippings/content/tbMessengerOverlay.js", window, "UTF-8");


function onLoad(aActivatedWhileWindowOpen)
{
  // Logging to the console doesn't seem to be working.
  aeUtils.log("Clippings/mx::messenger.js: Starting Clippings for Thunderbird from main three-pane window.");

  let strBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  WL.injectCSS("chrome://clippings/content/style/overlay.css");
  
  // Place the status bar icon so that it appears as the last item, before
  // the window resizer grippy
  let statusBar = document.getElementById("status-bar");
  let statusbarpanel = document.createElement("hbox");
  let statusbarBtn = document.createElement("toolbarbutton");
  statusbarBtn.id = "ae-clippings-icon";
  statusbarBtn.setAttribute("context", "ae-clippings-popup");
  statusbarBtn.setAttribute("tooltiptext", strBundle.getString("appName"));
  //statusbarBtn.setAttribute("tooltiptext", "Clippings");

  statusbarBtn.addEventListener("command", aEvent => {
    window.aecreations.clippings.openClippingsManager();
  });

  statusbarpanel.appendChild(statusbarBtn);
  statusBar.insertBefore(statusbarpanel, statusBar.lastChild);
}


function onUnload(aDeactivatedWhileWindowOpen)
{
  // Cleaning up the window UI is only needed when the
  // add-on is being deactivated/removed while the window
  // is still open. It can be skipped otherwise.
  if (! aDeactivatedWhileWindowOpen) {
    return;
  }

  //...
}
