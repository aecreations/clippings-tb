/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");


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

  var shortcutKeyPrefix, shortcutKeyPrefixWx;
  if (aeUtils.getOS() == "Darwin") {
    shortcutKeyPrefix = gStrBundle.getString("shortcutKeyPrefixMac");
    shortcutkeyPrefixWx = gStrBundle.getString("shortcutKeyPrefixWxMac");
  }
  else {
    shortcutKeyPrefix = gStrBundle.getString("shortcutKeyPrefix");
    shortcutKeyPrefixWx = gStrBundle.getString("shortcutKeyPrefixWx");
  }

  if (aeUtils.getHostAppID() == aeConstants.HOSTAPP_TB_GUID) {    
    $("paste-html-formatted-clipping").value = gStrBundle.getString("htmlPasteOptionsTB");
  }

  var shortcutKeyStr = gStrBundle.getFormattedString("shortcutMode", [shortcutKeyPrefix]);
  $("enable-shortcut-key").label = shortcutKeyStr;
  $("enable-shortcut-key").accessKey = gStrBundle.getString("shortcutModeAccessKey");
  $("enable-clippings6-shortcut-key").label = gStrBundle.getFormattedString("shortcutModeNew", [shortcutKeyPrefixWx]);
  $("enable-clippings6-shortcut-key").accessKey = gStrBundle.getString("shortcutModeNewAccessKey");

  let shortcutKeyEnabled = aeUtils.getPref("clippings.enable_keyboard_paste", true);
  if (! shortcutKeyEnabled) {
    $("enable-clippings6-shortcut-key").disabled = true;
  }
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


function toggleEnableClippings6ShortcutKey()
{
  let enableShortcutKey = $("enable-shortcut-key");
  let enableClippings6ShortcutKey = $("enable-clippings6-shortcut-key");
  enableClippings6ShortcutKey.disabled = !enableShortcutKey.checked;

  if (! enableShortcutKey.checked) {
    enableClippings6ShortcutKey.checked = false;
    aeUtils.setPref("clippings.enable_wx_paste_prefix_key", false);
  }
}
