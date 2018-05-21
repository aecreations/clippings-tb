/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");


var gStrBundle;
var gDataSrcLocationOpt, gCustomDataSrcPath, gCustomDataSrcBrws;
var gPrevSelectedDataSrcOpt, gPrevDataSrcPath;
var gClippingsSvc;


//
// Utility functions
//

function getHostAppName()
{
  var rv;
  var hostAppID = aeUtils.getHostAppID();

  if (hostAppID == aeConstants.HOSTAPP_FX_GUID) {
    rv = gStrBundle.getString("fx");
  }
  else if (hostAppID == aeConstants.HOSTAPP_TB_GUID) {
    rv = gStrBundle.getString("tb");
  }

  return rv;
}



//
// Dialog box functions
//

function initPrefPaneDataSource()
{
  initDlg();

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    aeUtils.alertEx(document.title, e);
  }

  // Workaround to height rendering issue on the <description> element of the
  // pref dialog.  Don't do this on Thunderbird, where the <description>
  // element will be hidden.
  var prefs = Services.prefs;
  var fadeInEffect = false;
  if (prefs.getPrefType("browser.preferences.animateFadeIn") == prefs.PREF_BOOL) {
    fadeInEffect = prefs.getBoolPref("browser.preferences.animateFadeIn");
  }

  if (!fadeInEffect && aeUtils.getHostAppID() != aeConstants.HOSTAPP_TB_GUID) {
    window.sizeToContent();
    var hbox = $("remove-all-src-urls-panel");
    hbox.height = hbox.boxObject.height;
    window.sizeToContent();
  }

  gDataSrcLocationOpt = $("datasrc-location-opt");
  gCustomDataSrcPath = $("custom-datasrc-path");
  gCustomDataSrcBrws = $("custom-datasrc-brws");

  // Set the proper host app name of the first radio button option.
  var hostAppProfDirRadioBtn = $("hostapp-profile-folder");
  var hostAppName = getHostAppName();
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

  // On Thunderbird, hide the button to strip out source URLs in all clippings.
  if (aeUtils.getHostAppID() == aeConstants.HOSTAPP_TB_GUID) {
    $("src-urls-groupbox").hidden = true;
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
  var filePicker = Components.classes["@mozilla.org/filepicker;1"]
                             .createInstance(Components.interfaces
					               .nsIFilePicker);
  var dataSrcDir = Components.classes["@mozilla.org/file/local;1"]
                             .createInstance(Components.interfaces.nsIFile);
  dataSrcDir.initWithPath(gCustomDataSrcPath.value);
  filePicker.displayDirectory = dataSrcDir;

  filePicker.init(window, "", filePicker.modeGetFolder);

  var fpShownCallback = {
    done: function (aResult) {
      if (aResult == filePicker.returnOK) {
        gCustomDataSrcPath.value = filePicker.file.path;
        $("remove-all-src-urls").disabled = true;
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


function removeAllSourceURLs()
{
  var confirmRemove = aeUtils.confirmYesNo(document.title, gStrBundle.getString("removeAllSrcURLsWarning"), true);

  if (confirmRemove) {
    // Do a backup of the datasource first
    gClippingsSvc.flushDataSrc(true);

    gClippingsSvc.removeAllSourceURLs();
    gClippingsSvc.flushDataSrc(false);

    aeUtils.alertEx(document.title, gStrBundle.getString("removeAllSrcURLsFinish"));

    $("remove-all-src-urls").disabled = true;
  }
}


function applyDataSourcePrefChanges() 
{

  var numBackupFiles = aeUtils.getPref("clippings.backup.maxfiles", 10);
  gClippingsSvc.setMaxBackupFiles(numBackupFiles);

  var newDataSrcPath;

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
    doAlert(gStrBundle.getString("errorDSReset"));
    return;
  }

  gClippingsSvc.notifyDataSrcLocationChanged();
  aeUtils.setPref("clippings.datasource.location", newDataSrcPath);

  return true;
}
