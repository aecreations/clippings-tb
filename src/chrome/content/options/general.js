/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://clippings/modules/aeConstants.js");
Components.utils.import("resource://clippings/modules/aeUtils.js");


function initPrefPaneGeneral()
{
  initDlg();

  // Workaround to height rendering issue on the <description> element of the
  // pref dialog.  Do not do this on platforms where pref dialogs dynamically
  // adjust their heights when switching between pref panes (e.g. Mac OS X), as
  // it will interfere with the dialog height.
  var prefs = Services.prefs;
  var fadeInEffect = false;
  if (prefs.getPrefType("browser.preferences.animateFadeIn") == prefs.PREF_BOOL) {
    fadeInEffect = prefs.getBoolPref("browser.preferences.animateFadeIn");
  }
  
  if (! fadeInEffect) {
    window.sizeToContent();
    var vbox = $("paste-html-vbox");
    vbox.height = vbox.boxObject.height;
    window.sizeToContent();
  }

  var shortcutKeyPrefix;
  if (aeUtils.getOS() == "Darwin") {
    shortcutKeyPrefix = gStrBundle.getString("shortcutKeyPrefixMac");
  }
  else {
    shortcutKeyPrefix = gStrBundle.getString("shortcutKeyPrefix");
  }

  if (aeUtils.getHostAppID() == aeConstants.HOSTAPP_TB_GUID) {    
    $("paste-html-formatted-clipping").value = gStrBundle.getString("htmlPasteOptionsTB");
  }

  var shortcutKeyStr = gStrBundle.getFormattedString("shortcutMode", [shortcutKeyPrefix]);
  $("enable-shortcut-key").label = shortcutKeyStr;
  $("enable-shortcut-key").accessKey = gStrBundle.getString("shortcutModeAccessKey");
}


function showChangedPrefMsg() 
{
  var strKey;
  var hostAppID = aeUtils.getHostAppID();

  if (hostAppID == aeConstants.HOSTAPP_FX_GUID) {
    strKey = "prefChangeMsgFx";
  }
  else if (hostAppID == aeConstants.HOSTAPP_TB_GUID) {
    strKey = "prefChangeMsgTb";
  }

  aeUtils.alertEx(document.title, gStrBundle.getString(strKey));
}
