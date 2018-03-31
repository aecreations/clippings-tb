/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeString.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

const Cc = Components.classes;
const Ci = Components.interfaces;

var gDlgArgs;
var gClippingsSvc;


function initWnd()
{
  gDlgArgs = window.arguments[0];

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    alert(e);
  }
}


function processKeyPress(aEvent)
{
  // Remember the paste shortcut mode for next time.
  aeUtils.setPref("clippings.paste_shortcut_mode", gDlgArgs.ACTION_SHORTCUT_KEY);

  if (aEvent.key == "F1") {
    gDlgArgs.action = gDlgArgs.SHORTCUT_KEY_HELP;
    gDlgArgs.switchModes = true;
 }
  else if (aEvent.key == "Tab") {
    gDlgArgs.action = gDlgArgs.ACTION_SEARCH_CLIPPING;
    gDlgArgs.switchModes = true;
  }
  else if (aEvent.key == "Escape" || aEvent.key == "Esc") {
    gDlgArgs.switchModes = false;
    gDlgArgs.userCancel = true;
  }
  else {
    var key = aEvent.key.toUpperCase();

    aeUtils.log(aeString.format("Clippings: Key pressed: %S", key));

    var keyDict = gClippingsSvc.getShortcutKeyDict();
    var keys;
    var keyCount = {};
    keys = keyDict.getKeys(keyCount);

    if (! keyDict.hasKey(key)) {
      aeUtils.beep();
      gDlgArgs.userCancel = true;
      window.close();
      return;
    }

    try {
      var valueStr = keyDict.getValue(key);
    }
    catch (e) {}
    
    valueStr = valueStr.QueryInterface(Components.interfaces.nsISupportsString);
    gDlgArgs.clippingURI = valueStr.data;
    gDlgArgs.switchModes = false;
    gDlgArgs.userCancel = false;
  }

  window.close();
}


function cancel()
{
  // Remember the paste shortcut mode for next time, even if user cancelled.
  aeUtils.setPref("clippings.paste_shortcut_mode", gDlgArgs.ACTION_SHORTCUT_KEY);

  gDlgArgs.userCancel = true;
  gDlgArgs.switchModes = false;
  window.close();
}


function unload()
{

}
