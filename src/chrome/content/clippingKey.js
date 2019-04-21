/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

var gDlgArgs;
var gClippingsSvc;


function initWnd()
{
  gDlgArgs = window.arguments[0];

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    aeUtils.log("clippingKey.js::initWnd(): Error retrieving Clippings service: " + e);
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
    let key = aEvent.key.toUpperCase();

    aeUtils.log(`clippingKey.js::processKeyPress(): Key pressed: '${key}'`);

    let keyMap = gClippingsSvc.getShortcutKeyMap();

    if (! keyMap.has(key)) {
      aeUtils.beep();
      gDlgArgs.userCancel = true;
      window.close();
      return;
    }

    gDlgArgs.clippingURI = keyMap.get(key);
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
