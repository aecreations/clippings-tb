/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

var gDlgArgs;


function initWnd()
{
  gDlgArgs = window.arguments[0];
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
    // TEMPORARY
    /***
    gDlgArgs.action = gDlgArgs.ACTION_SEARCH_CLIPPING;
    gDlgArgs.switchModes = true;
    ***/
    // END TEMPORARY
  }
  else if (aEvent.key == "Escape" || aEvent.key == "Esc") {
    gDlgArgs.switchModes = false;
    gDlgArgs.userCancel = true;
  }
  else {
    let key = aEvent.key.toUpperCase();

    aeUtils.log(`clippingKey.js::processKeyPress(): Key pressed: '${key}'`);

    if (gDlgArgs.keyMap.has(key)) {
      gDlgArgs.clippingID = gDlgArgs.keyMap.get(key).id;
      gDlgArgs.switchModes = false;
      gDlgArgs.userCancel = false;
    }
    else {
      aeUtils.beep();
      gDlgArgs.userCancel = true;
    }
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
