/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {AddonManager} = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
const {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {aePackagedClippings} = ChromeUtils.import("resource://clippings/modules/aePackagedClippings.js");

//
// Clippings initialization library for version 3.0 and later
//
const EXPORTED_SYMBOLS = ["aeClippings3"];

const Cc = Components.classes;
const Ci = Components.interfaces;


var aeClippings3 = {
  _clippingsSvc:  null,
  _strBundle:     null,
  E_INIT_MISSING_ARG:  "aeIClippingsService argument to aeClippings3 initializer is missing or undefined",
  E_CLIPPINGSSVC_NOT_INITIALIZED: "aeIClippingsService not initialized"
};



/*
 * Module initializer - must be invoked before any other methods
 */
aeClippings3.init = function (aClippingsSvc, aStringBundle) 
{
  if (! aClippingsSvc) {
    throw this.E_INIT_MISSING_ARG;
  }

  this._clippingsSvc = aClippingsSvc;
  this._strBundle = aStringBundle;
};


/*
 * Starts the initialization process.
 * Returns true if the entire initialization process completed, or false if
 * initialization was aborted.  Note that just because this method may return
 * true doesn't necessarily mean that initialization succeeded!
 */
aeClippings3.startInit = function ()
{
  try {
    this._initDataSource();
  }
  catch (e) {
    return false;
  }

  this._importPackagedClippings();
  this._processEmptyFolders();

  return true;
};


/*
 * Initializes the datasource.
 * Throws an exception if datasource initialization failed.
 */
aeClippings3._initDataSource = function ()
{  
  var pathURL = aeUtils.getDataSourcePathURL();
  var ds = this._clippingsSvc.getDataSource(pathURL + aeConstants.CLIPDAT_FILE_NAME);
  var backupDirURL = aeUtils.getDataSourcePathURL() + aeConstants.BACKUP_DIR_NAME;

  this._clippingsSvc.setBackupDir(backupDirURL);
};


/*
 * Import clippings from the packaged data source file, if it exists.
 * Prerequisite: Datasource must be already initialized.
 */
aeClippings3._importPackagedClippings = function ()
{
  AddonManager.getAddonByID(aeConstants.EXTENSION_ID, function (aAddon) {
    let extInstallDirURI = aAddon.getResourceURI();
    aePackagedClippings.init(extInstallDirURI.spec);

    if (aePackagedClippings.exists()) {
      aeUtils.log("Packaged clipping datasource file detected.");
      aeClippings3._importPackagedClippingsHelper();
    }
  });
};

aeClippings3._importPackagedClippingsHelper = function ()
{
  try {
    aePackagedClippings.importData(this._clippingsSvc);
  }
  catch (e) {
    if (e == aePackagedClippings.E_FLUSH_FAILED) {
      aeUtils.alertEx(this._strBundle.getString("appName"),
                      this._strBundle.getString("errorFlushAfterPDSImport"));
    }
    else {
      aeUtils.alertEx(this._strBundle.getString("appName"),
                      this._strBundle.getString("errorDSImportFailure"));
      var consoleSvc = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
      var msg = `Packaged Clipping import error: ${e}`;
      consoleSvc.logStringMessage(msg);
    }
  }
};


/*
 * Process empty subfolders recursively and append the empty clipping
 * to each empty folder.
 * Prerequisite: Datasource must be already initialized.
 */
aeClippings3._processEmptyFolders = function ()
{
  try {
    this._clippingsSvc.processEmptyFolders();
  }
  catch (e) {
    throw this.E_CLIPPINGSSVC_NOT_INITIALIZED;
  }
};


/*
 * Invoked when upgrading from Clippings 3.x to 4.0.
 * This method removes the deprecated user pref "clippings.datassource.common".
 * If the pref was set to "true", then this method sets the new user pref
 * "clippings.datasource.location" to be the user's home directory.
 * For first-time users, this method simply initializes the new user pref to
 * the default value, i.e. the user's host app profile directory.
 * It is NOT necessary to invoke method init() prior to this method.
 */
aeClippings3.migrateCommonDataSrcPref = function ()
{
  var profileDirPath;
  var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
  var isCommonDS = false;
  if (prefs.getPrefType("clippings.datasource.common") == prefs.PREF_BOOL) {
    isCommonDS = prefs.getBoolPref("clippings.datasource.common");
  }

  if (isCommonDS) {
    // Upgrading from Clippings 3.x - migrate the deprecated pref
    // "clippings.datasource.common"
    profileDirPath = aeUtils.getHomeDir().path;

    // Remove the deprecated user pref.
    try {
      prefs.clearUserPref("clippings.datasource.common");
    }
    catch (e) {
      aeUtils.log(`aeClippings3._initDataSource(): Failed to remove deprecated user pref "clippings.datasource.common": ${e}`);
    }
  }
  else {
    profileDirPath = aeUtils.getUserProfileDir().path;
  }

  aeUtils.setPref("clippings.datasource.location", profileDirPath);
};
