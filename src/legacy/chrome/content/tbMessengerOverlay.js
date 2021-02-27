/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Integration with main window and message view window
//


if (! ('aecreations' in window)) {
  window.aecreations = {};
}

if (! ('clippings' in window.aecreations)) {
  window.aecreations.clippings = {};
}
else {
  throw new Error("clippings object already defined");
}

window.aecreations.clippings = {
  isClippingsInitialized: false,
  showDialog:             true,
  strBundle:              null,
  _clippingsMxListener:   null,

  
  addMxListener: function (aListener)
  {
    this._clippingsMxListener = aListener;
  },

  removeMxListener: function ()
  {
    this._clippingsMxListener = null;
  },

  getMxListener: function ()
  {
    return this._clippingsMxListener;
  },


  //
  // Browser window and Clippings menu initialization
  //

  async initClippings()
  {  
    // Workaround to this init function being called multiple times.
    if (this.isClippingsInitialized) {
      return;
    }

    this.strBundle = this.util.aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
    /**
    try {
      this.clippingsSvc = this.svc.aeClippingsService.getService();
    }
    catch (e) {
      this.alert(e);
    }

    this.clippingsSvc.setEmptyClippingString(this.strBundle.getString("emptyClippingLabel"));
    this.clippingsSvc.setSyncedClippingsFolderName(this.strBundle.getString("syncFldrLabel"));
    **/
    
    let profilePath = this.util.aeUtils.getUserProfileDir().path;
    let dsPath = this.util.aeUtils.getPref("clippings.datasource.location", profilePath);

    /**
    // Initialize the datasource in the Clippings JS service
    var err = false;
    var dsURL = this.util.aeUtils.getDataSourcePathURL() + this.cnst.aeConstants.CLIPDAT_FILE_NAME;
    try {
      var ds = this.clippingsSvc.getDataSource(dsURL);
    }
    catch (e) {
      if (e.result === undefined) {
	err = this.strBundle.getString("errorInit");
      }
      else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
	err = this.strBundle.getString("errorOutOfMemory");
      }
      else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
	err = this.str.aeString.format("%s: %s",
		  	    this.strBundle.getString("errorAccessDenied"),
			    this.cnst.aeConstants.CLIPDAT_FILE_NAME);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
	err = this.str.aeString.format("%s: %s",
		  	    this.strBundle.getString("errorFileLocked"),
			    this.cnst.aeConstants.CLIPDAT_FILE_NAME);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
	err = this.str.aeString.format("%s: %s",
		 	    this.strBundle.getString("errorFileTooBig"),
			    this.cnst.aeConstants.CLIPDAT_FILE_NAME);
      }
      else {
	// File is corrupt - open Clippings Manager and perform recovery.
	err = true;
      }
    }

    if (err) {
      this.openClippingsManager();
      return;
    }

    // Clippings backup
    var backupDirURL = this.util.aeUtils.getDataSourcePathURL() + this.cnst.aeConstants.BACKUP_DIR_NAME;
    this.clippingsSvc.setBackupDir(backupDirURL);
    this.clippingsSvc.setMaxBackupFiles(this.util.aeUtils.getPref("clippings.backup.maxfiles", 10));

    this.dataSrcInitialized = true;
    **/
    
    this.util.aeUtils.log(`initClippings(): Clippings data source successfully loaded.\nHost app: ${this.util.aeUtils.getHostAppName()} (version ${this.util.aeUtils.getHostAppVersion()})\nOS identifier: ${this.util.aeUtils.getOS()}\nInitializing Clippings integration with host app window: ${window.location.href}`);

    /**
    // Add null clipping to root folder if there are no items
    if (this.util.aeUtils.getPref("clippings.datasource.process_root", true) == true) {
      this.clippingsSvc.processRootFolder();
      this.util.aeUtils.setPref("clippings.datasource.process_root", false);
    }
    **/
    /***
    let syncClippings = this.util.aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
    if (syncClippings) {
      this.util.aeUtils.log("gClippings.initClippings(): Sync Clippings is turned on. Refreshing the Synced Clippings folder.");

      let syncDirPath = this.util.aeUtils.getPref("clippings.datasource.wx_sync.location", "");
      if (! syncDirPath) {
	syncDirPath = this.util.aeUtils.getPref("clippings.datasource.location", "");
	this.util.aeUtils.setPref("clippings.datasource.wx_sync.location", syncDirPath);
      }
      this.util.aeUtils.log("gClippings.initClippings: Sync folder location: " + syncDirPath);

      let syncDirURL = this.util.aeUtils.getURLFromFilePath(syncDirPath);
      this.clippingsSvc.setSyncDir(syncDirURL);
      this.clippingsSvc.refreshSyncedClippings(false);
    }
    ***/
    /**
    // Dynamically create status bar icon popup menu.  Defining it in
    // tbMessengerOverlay.xul won't work - it seems to disappear during loading
    // of the Messenger window.
    var popup = document.createElement("menupopup");
    popup.id = "ae-clippings-popup";

    var openClippingsMgr = document.createElement("menuitem");
    openClippingsMgr.setAttribute("label", this.strBundle.getString("openClippingsMgr"));
    openClippingsMgr.setAttribute("command", "ae_clippings_manager");
    openClippingsMgr.setAttribute("default", "true");

    var newFromClpbd = document.createElement("menuitem");
    newFromClpbd.setAttribute("command", "ae_new_clipping_from_clpbd");
    
    popup.appendChild(openClippingsMgr);
    popup.appendChild(newFromClpbd);
    document.getElementById("messengerWindow").appendChild(popup);

    // Initialize "New From Clipboard" command on status bar icon menu.
    var ellipsis = this.showDialog ? this.strBundle.getString("ellipsis") : "";
    var newFromClpbdCmd = document.getElementById("ae_new_clipping_from_clpbd");
    newFromClpbdCmd.setAttribute("label",
				 this.strBundle.getString("newFromClipbd")
				 + ellipsis);

    // Disable Clippings Manager window persistence via JavaScript if running
    // on Mac OS X, unless user has explicitly set it.
    if (this.util.aeUtils.getOS() == "Darwin") {
      if (! this.util.aeUtils.hasPref("clippings.clipmgr.disable_js_window_geometry_persistence")) {
	this.util.aeUtils.setPref("clippings.clipmgr.disable_js_window_geometry_persistence", true);
      }
    }
    **/
    window.setTimeout(() => { this.getMxListener().legacyDataMigrationVerified() }, 3000);

    this.isClippingsInitialized = true;
  },


  //
  // Methods invoked by overlay code
  //

  openClippingsManager: function () 
  {
    this.getMxListener().clippingsManagerWndOpened();
  }
};

window.aecreations.clippings.cnst = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
window.aecreations.clippings.util = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
