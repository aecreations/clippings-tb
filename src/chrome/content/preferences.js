/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

let gStrBundle;
let gClippingsSvc;
let gDataSrcLocationOpt, gCustomDataSrcPath, gCustomDataSrcBrws, gSyncFilePath;
let gPrevSelectedDataSrcOpt, gPrevDataSrcPath, gSyncClippings;
let gWasSyncActive;


function $(aID) 
{
  return document.getElementById(aID);
}


function initDlg()
{
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    aeUtils.alertEx(document.title, e);
  }
  
  let titleKey;
  if (aeUtils.getOS() == "WINNT") {
    titleKey = "clippingsOptions";
  }
  else {
    titleKey = "clippingsPreferences";
  }
  $("ae-clippings-preferences").setAttribute("title", gStrBundle.getString(titleKey));

  $("paste-html-formatted-clipping").value = gStrBundle.getString("htmlPasteOptionsTB");

  let shortcutKeyPrefix, shortcutKeyPrefixWx;
  if (aeUtils.getOS() == "Darwin") {
    shortcutKeyPrefix = gStrBundle.getString("shortcutKeyPrefixMac");
    shortcutKeyPrefixWx = gStrBundle.getString("shortcutKeyPrefixWxMac");
  }
  else {
    shortcutKeyPrefix = gStrBundle.getString("shortcutKeyPrefix");
    shortcutKeyPrefixWx = gStrBundle.getString("shortcutKeyPrefixWx");
  }

    let shortcutKeyStr = gStrBundle.getFormattedString("shortcutMode", [shortcutKeyPrefix]);
  $("enable-shortcut-key").label = shortcutKeyStr;
  $("enable-shortcut-key").accessKey = gStrBundle.getString("shortcutModeAccessKey");
  $("enable-clippings6-shortcut-key").label = gStrBundle.getFormattedString("shortcutModeNew", [shortcutKeyPrefixWx]);
  $("enable-clippings6-shortcut-key").accessKey = gStrBundle.getString("shortcutModeNewAccessKey");

  // General preferences
  $("html-paste-options").selectedIndex = aeUtils.getPref("clippings.html_paste", 0);
  $("html-auto-line-break").checked = aeUtils.getPref("clippings.html_auto_line_break", true);
  $("use-clipboard").checked = !aeUtils.getPref("clippings.use_clipboard", false);

  let shortcutKeyEnabled = aeUtils.getPref("clippings.enable_keyboard_paste", true);
  if (! shortcutKeyEnabled) {
    $("enable-clippings6-shortcut-key").disabled = true;
  }
  $("enable-shortcut-key").checked = aeUtils.getPref("clippings.enable_keyboard_paste", true);
  $("enable-clippings6-shortcut-key").checked = aeUtils.getPref("clippings.enable_wx_paste_prefix_key", true);

  $("check-spelling").checked = aeUtils.getPref("clippings.check_spelling", true);
  $("beep-on-errors").checked = aeUtils.getPref("clippings.beep_on_error", true);

  // Data Source preferences
  gDataSrcLocationOpt = $("datasrc-location-opt");
  gCustomDataSrcPath = $("custom-datasrc-path");
  gCustomDataSrcBrws = $("custom-datasrc-brws");
  gSyncClippings = $("sync-clippings");
  gSyncFilePath = $("sync-file-path"); 
  
  let hostAppProfDirRadioBtn = $("hostapp-profile-folder");
  let hostAppName = gStrBundle.getString("tb");
  hostAppProfDirRadioBtn.label = gStrBundle.getFormattedString("hostAppProfDir", [hostAppName]);
  hostAppProfDirRadioBtn.accessKey = gStrBundle.getString("hostAppProfDirAccessKey");

  let homePath = aeUtils.getHomeDir().path;
  let profilePath = aeUtils.getUserProfileDir().path;
  let dataSrcPath = aeUtils.getPref("clippings.datasource.location", "");
  if (! dataSrcPath) {
    // The pref should have been set on first run.
    dataSrcPath = profilePath;
    aeUtils.setPref("clippings.datasource.location", dataSrcPath);
  }

  if (dataSrcPath == profilePath) {
    gDataSrcLocationOpt.selectedIndex = 0;
    gCustomDataSrcBrws.disabled = true;
    gCustomDataSrcPath.disabled = true;
    gCustomDataSrcPath.value = homePath;
  }
  else {
    gDataSrcLocationOpt.selectedIndex = 1;
    gCustomDataSrcPath.value = dataSrcPath;
  }
  
  gPrevSelectedDataSrcOpt = gDataSrcLocationOpt.selectedIndex;
  gPrevDataSrcPath = dataSrcPath;

  let syncPath = aeUtils.getPref("clippings.datasource.wx_sync.location", "");
  if (syncPath) {
    gSyncFilePath.value = syncPath;
  }
  else {
    if (gDataSrcLocationOpt.selectedIndex == 0) {
      gSyncFilePath.value = aeUtils.getHomeDir().path;
    }
    else {
      gSyncFilePath.value = dataSrcPath;
    }
  }

  let isSyncActive = aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
  gSyncFilePath.disabled = !isSyncActive;
  $("sync-file-path-label").disabled = !isSyncActive;
  $("sync-file-path-brws").disabled = !isSyncActive;
  gWasSyncActive = isSyncActive;

  $("max-backup-files").value = aeUtils.getPref("clippings.backup.maxfiles", 10);
  $("sync-clippings").checked = aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
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


function changeDataSrcLocationOptions()
{
  var newDataSrcPath;

  if (gDataSrcLocationOpt.selectedIndex == 0) {
    gCustomDataSrcBrws.disabled = true;
    gCustomDataSrcPath.disabled = true;
    newDataSrcPath = aeUtils.getUserProfileDir().path;
  }
  else if (gDataSrcLocationOpt.selectedIndex == 1) {
    gCustomDataSrcBrws.disabled = false;
    gCustomDataSrcPath.disabled = false;
    newDataSrcPath = gCustomDataSrcPath.value;
  }
  
  // The action to remove all source URLs from clippings would only apply
  // to the old datasource, not the new one (until after applying the
  // change to the datasource location)
  $("remove-all-src-urls").disabled = (newDataSrcPath != gPrevDataSrcPath);
}


function browseDataSrcPath()
{
  let filePicker = Components.classes["@mozilla.org/filepicker;1"]
                             .createInstance(Components.interfaces
					               .nsIFilePicker);
  let dataSrcDir = Components.classes["@mozilla.org/file/local;1"]
                             .createInstance(Components.interfaces.nsIFile);
  dataSrcDir.initWithPath(gCustomDataSrcPath.value);
  filePicker.displayDirectory = dataSrcDir;

  filePicker.init(window, "", filePicker.modeGetFolder);

  let fpShownCallback = {
    done(aResult) {
      if (aResult == filePicker.returnOK) {
        gCustomDataSrcPath.value = filePicker.file.path;
        $("remove-all-src-urls").disabled = true;
      }
    }
  };

  filePicker.open(fpShownCallback);
}


function setSyncFilePath()
{
  let syncClippings = $("sync-clippings");
  $("sync-file-path-label").disabled = !syncClippings.checked;
  $("sync-file-path").disabled = !syncClippings.checked;
  $("sync-file-path-brws").disabled = !syncClippings.checked;
}


function browseSyncFilePath()
{
  let filePicker = Components.classes["@mozilla.org/filepicker;1"]
                             .createInstance(Components.interfaces
					               .nsIFilePicker);
  let syncDir = Components.classes["@mozilla.org/file/local;1"]
                           .createInstance(Components.interfaces.nsIFile);

  syncDir.initWithPath(gSyncFilePath.value);
  filePicker.init(window, "", filePicker.modeGetFolder);
  
  let fpShownCallback = {
    done(aResult) {
      if (aResult == filePicker.returnOK) {
	gSyncFilePath.value = filePicker.file.path;
      }
    }
  };

  filePicker.open(fpShownCallback);
}


function showBackupFiles()
{
  let backupDir = gClippingsSvc.getBackupDir();
  backupDir.reveal();
}


function showSyncClippingsMinihelp()
{
  let hlpTitle = gStrBundle.getString("syncClpgs");
  let hlpText = gStrBundle.getString("syncClpgsHlp");
  
  window.openDialog("chrome://clippings/content/miniHelp.xul", "ae_minihlp_wnd", "centerscreen,dialog,modal", hlpTitle, hlpText);  
}


function applyDataSourcePrefChanges() 
{
  let rv = false;
  let numBackupFiles = aeUtils.getPref("clippings.backup.maxfiles", 10);
  gClippingsSvc.setMaxBackupFiles(numBackupFiles);

  // Save clippings one last time before changing datasource and/or
  // sync folder locations.
  gClippingsSvc.flushDataSrc(true, gWasSyncActive);
  
  let newDataSrcPath;

  if (gDataSrcLocationOpt.selectedIndex == 0) {
    newDataSrcPath = aeUtils.getUserProfileDir().path;
  }
  else {
    newDataSrcPath = gCustomDataSrcPath.value;
  }

  let dsURL = aeUtils.getURLFromFilePath(newDataSrcPath);

  // Reinitialize the datasource to point to the new datasource location.
  gClippingsSvc.reset();
  try {
    gClippingsSvc.getDataSource(dsURL + aeConstants.CLIPDAT_FILE_NAME);
    gClippingsSvc.setBackupDir(dsURL + aeConstants.BACKUP_DIR_NAME);
  }
  catch (e) {
    aeUtils.alertEx(document.title, gStrBundle.getString("errorDSReset"));
    return rv;
  }

  gClippingsSvc.notifyDataSrcLocationChanged();
  aeUtils.setPref("clippings.datasource.location", newDataSrcPath);

  let isWxSyncEnabled = gSyncClippings.checked;
  aeUtils.setPref("clippings.datasource.wx_sync.enabled", isWxSyncEnabled);

  if (isWxSyncEnabled) {
    let syncDirPath = gSyncFilePath.value;
    let syncDirURL = aeUtils.getURLFromFilePath(syncDirPath);
    gClippingsSvc.setSyncDir(syncDirURL);
    gClippingsSvc.refreshSyncedClippings(true);
    aeUtils.setPref("clippings.datasource.wx_sync.location", syncDirPath);
  }
  gClippingsSvc.enableSyncClippings(isWxSyncEnabled);
  rv = true;
  
  return rv;
}


function accept()
{
  let rv = true;
  
  aeUtils.setPref("clippings.html_paste", $("html-paste-options").value);
  aeUtils.setPref("clippings.html_auto_line_break", $("html-auto-line-break").checked);
  aeUtils.setPref("clippings.use_clipboard", $("use-clipboard").checked);
  aeUtils.setPref("clippings.enable_keyboard_paste", $("enable-shortcut-key").checked);
  aeUtils.setPref("clippings.enable_wx_paste_prefix_key", $("enable-clippings6-shortcut-key").checked);
  aeUtils.setPref("clippings.check_spelling", $("check-spelling").checked);
  aeUtils.setPref("clippings.beep_on_error", $("beep-on-errors").checked);

  rv = applyDataSourcePrefChanges();
  
  return rv;
}


function cancel()
{
  return true;
}
