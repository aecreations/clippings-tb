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
  dataSrcInitialized:     false,
  isClippingsInitialized: false,
  showDialog:             true,
  clippingsSvc:           null,
  strBundle:              null,


  // Method handleEvent() effectively makes the Clippings overlay object an
  // implementation of the EventListener interface; therefore it can be passed
  // as the listener argument to window.addEventListener() and
  // window.removeEventListener()

  handleEvent: function (aEvent)
  {
    // When this method is invoked, 'this' will not refer to the Clippings
    // overlay object.
    let that = window.aecreations.clippings;

    if (aEvent.type == "load") {
      that.initClippings();
    }
    else if (aEvent.type == "unload") {
      window.removeEventListener("load", that, false);
      window.removeEventListener("unload", that, false);
    }
  },


  //
  // Drag 'n drop event handlers for Clippings status bar icon
  //

  statusBarDrop: function (aEvent)
  {
    if (! this.dataSrcInitialized) {
      // The RDF data source has to be initialized if it has not already been
      // done so, otherwise RDF node creation will fail, and the new
      // Clippings entry will never be created.
      // This initialization is done in the code for the Clippings popup
      // menu's `onpopupshowing' event handler.
      this.initClippingsPopup(document.getElementById("ae-clippings-popup-1"),
                              document.getElementById("ae-clippings-menu-1"));
    }

    var text = aEvent.dataTransfer.getData("text/plain");
    var result = this.aeCreateClippingFromText(this.clippingsSvc, text, null, this.showDialog, window, null, false);

    if (result) {
      let that = window.aecreations.clippings;
      window.setTimeout(function () { that.saveClippings(); }, 100);
    }
  },


  //
  // Methods invoked by overlay code
  //

  alert: function (aMessage)
  {
    var title = this.strBundle.getString('appName');
    this.aeUtils.alertEx(title, aMessage);
  },


  newFromClipboard: function () 
  {
    if (! this.dataSrcInitialized) {
      this.alert("ERROR: Clippings hasn't been initialized yet!");
      return;
    }

    var txt = this.aeUtils.getTextFromClipboard();
    if (! txt) {
      var clippingsBtn = document.getElementById("ae-clippings-icon");
      var panel = document.getElementById("ae-clippings-clipboard-alert");
      panel.openPopup(clippingsBtn, "after_pointer", 0, 0, false, false);
      return;
    }

    var result = this.aeCreateClippingFromText(this.clippingsSvc, txt, null, this.showDialog, window, null, false);
    if (result) {
      let that = this;
      window.setTimeout(function () { 
        that.saveClippings();
      }, 1);
    }
  },


  getSelectedText: function ()
  {
    var rv;
    var focusedWnd = document.commandDispatcher.focusedWindow;
    rv = focusedWnd.getSelection().toString();
    return rv;
  },


  openClippingsManager: function () 
  {
    var wnd = window.open("chrome://clippings/content/clippingsMgr.xul",
			  "clippings_wndobj", "chrome,resizable");
    wnd.focus();
  },


  insertClippingText: function (aText) 
  {
    this.aeUtils.copyTextToClipboard(aText);

    try {
      // Paste clipping.  The following function is defined in
      // "chrome://global/content/globalOverlay.js"
      goDoCommand("cmd_paste");
      // SIDE EFFECT: The clipping text will remain on the system clipboard.
    }
    catch (e) {
      // Exception thrown if command is disabled or not applicable
      this.aeUtils.beep();
    }
  },


  saveClippings: function () 
  {
    let title = this.strBundle.getString("appName");
    let saveJSON = this.aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
    try {
      this.clippingsSvc.flushDataSrc(true, saveJSON);
    }
    catch (e) {
      if (e.result === undefined) {
	this.aeUtils.alertEx(title, this.strBundle.getString("alertSaveFailed"));
	return;
      }
      
      if (e.result == Components.results.NS_ERROR_NOT_INITIALIZED) {
	this.aeUtils.alertEx(title, this.strBundle.getString("errorSaveFailedDSNotInitialized"));
      }
      else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
	this.aeUtils.alertEx(title, this.strBundle.getString("errorOutOfMemory"));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
	var msg = this.aeString.format("%s: %s",
				this.strBundle.getString("errorAccessDenied"),
				this.aeConstants.CLIPDAT_FILE_NAME);
	this.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
	var msg = this.aeString.format("%s: %s",
				this.strBundle.getString("errorFileLocked"),
				this.aeConstants.CLIPDAT_FILE_NAME);
	this.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
	var msg = this.aeString.format("%s: %s",
				this.strBundle.getString("errorFileTooBig"),
				this.aeConstants.CLIPDAT_FILE_NAME);
	this.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_READ_ONLY) {
	var msg = this.aeString.format("%s: %s",
				this.strBundle.getString('errorFileReadOnly'),
				this.aeConstants.CLIPDAT_FILE_NAME);
	this.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_DISK_FULL) {
	var msg = this.aeString.format("%s: %s",
				this.strBundle.getString('errorDiskFull'),
				this.aeConstants.CLIPDAT_FILE_NAME);
	this.aeUtils.alertEx(title, msg);
      }
      else {
	this.aeUtils.alertEx(title, this.strBundle.getString("alertSaveFailed"));
      }
    }
  },


  //
  // Browser window and Clippings menu initialization
  //

  initClippings: function ()
  {  
    // Workaround to this init function being called multiple times.
    if (this.isClippingsInitialized) {
      return;
    }

    this.strBundle = document.getElementById("ae-clippings-strings");

    try {
      this.clippingsSvc = this.aeClippingsService.getService();
    }
    catch (e) {
      this.alert(e);
    }

    // String used for empty (null) clippings
    this.clippingsSvc.setEmptyClippingString(this.strBundle.getString('emptyClippingLabel'));

    // Migrate prefs from root to the "extensions." branch
    let prefsMigrated = this.aeUtils.getPref("clippings.migrated_prefs", false);
    if (! prefsMigrated) {
      this.aePrefMigrator.migratePrefs();
      this.aeUtils.setPref("clippings.migrated_prefs", true);
    }

    // Rename backup folder so that it isn't hidden on macOS and Linux.
    let dataSrcPathURL = this.aeUtils.getDataSourcePathURL();
    let oldBackupDirURL = dataSrcPathURL + this.aeConstants.OLD_BACKUP_DIR_NAME;
    let oldBackupDirPath = this.aeUtils.getFilePathFromURL(oldBackupDirURL);
    let oldBkupDir = Components.classes["@mozilla.org/file/local;1"]
                               .createInstance(Components.interfaces.nsIFile);

    oldBkupDir.initWithPath(oldBackupDirPath);
    if (oldBkupDir.exists() && oldBkupDir.isDirectory()) {
      this.aeUtils.log(`Detected old backup folder '.clipbak' in "${dataSrcPathURL}" - renaming it to '${this.aeConstants.BACKUP_DIR_NAME}'`);
      try {
        oldBkupDir.renameTo(null, this.aeConstants.BACKUP_DIR_NAME);
      }
      catch (e) {
        this.aeUtils.log(e);
        this.aeUtils.alertEx(this.strBundle.getString("appName"),
                             this.strBundle.getFormattedString("bkupFldrRenameError", [this.aeUtils.getFilePathFromURL(dataSrcPathURL)]));
      }
    }
    
    // First-run initialization
    if (this.aeUtils.getPref("clippings.first_run", true) == true) {
      // Starting with Clippings 4.0, the status bar in Clippings Manager will
      // be hidden by default for new users.  Users upgrading from earlier
      // versions of Clippings will continue to see the status bar.
      this.aeUtils.setPref("clippings.clipmgr.status_bar", false);
      
      this.aeUtils.setPref("clippings.first_run", false);
    }

    // Migration of deprecated common clippings pref (Clippings 4.0+)
    if (this.aeUtils.getPref("clippings.migrate_common_ds_pref", true) == true) {
      this.aeClippings3.migrateCommonDataSrcPref();
      this.aeUtils.setPref("clippings.migrate_common_ds_pref", false);
    }

    // First-run initialization after upgrade from 2.x -> 3.0+
    if (this.aeUtils.getPref("clippings.v3.first_run", true) == true) {
      this.aeClippings3.init(this.clippingsSvc, this.strBundle);
      var initFinished = this.aeClippings3.startInit();
      if (initFinished) {
	this.aeUtils.setPref("clippings.v3.first_run", false);
      }
    }

    let profilePath = this.aeUtils.getUserProfileDir().path;
    let dsPath = this.aeUtils.getPref("clippings.datasource.location", profilePath);
    
    // Initialize the datasource in the Clippings XPCOM service
    var err = false;
    var dsURL = this.aeUtils.getDataSourcePathURL() + this.aeConstants.CLIPDAT_FILE_NAME;
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
	err = this.aeString.format("%s: %s",
		  	    this.strBundle.getString("errorAccessDenied"),
			    this.aeConstants.CLIPDAT_FILE_NAME);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
	err = this.aeString.format("%s: %s",
		  	    this.strBundle.getString("errorFileLocked"),
			    this.aeConstants.CLIPDAT_FILE_NAME);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
	err = this.aeString.format("%s: %s",
		 	    this.strBundle.getString("errorFileTooBig"),
			    this.aeConstants.CLIPDAT_FILE_NAME);
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
    var backupDirURL = this.aeUtils.getDataSourcePathURL() + this.aeConstants.BACKUP_DIR_NAME;
    this.clippingsSvc.setBackupDir(backupDirURL);
    this.clippingsSvc.setMaxBackupFiles(this.aeUtils.getPref("clippings.backup.maxfiles", 10));

    this.dataSrcInitialized = true;

    this.aeUtils.log(this.aeString.format("gClippings.initClippings(): Clippings data source successfully loaded.\nHost app: %s (version %s)\nOS identifier: %s\nInitializing Clippings integration with host app window: %s", this.aeUtils.getHostAppName(), this.aeUtils.getHostAppVersion(), this.aeUtils.getOS(), window.location.href));

    // Add null clipping to root folder if there are no items
    if (this.aeUtils.getPref("clippings.datasource.process_root", true) == true) {
      this.clippingsSvc.processRootFolder();
      this.aeUtils.setPref("clippings.datasource.process_root", false);
    }

    let syncClippings = this.aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
    if (syncClippings) {
      this.aeUtils.log("gClippings.initClippings(): Sync Clippings is turned on. Refreshing the Synced Clippings folder.");

      this.clippingsSvc.refreshSyncedClippings();
    }

    this.showDialog = !(this.aeUtils.getPref("clippings.entries.add_silently", false));

    // Place the status bar icon so that it appears as the last item, before
    // the window resizer grippy
    let statusBar = document.getElementById("status-bar");
    let statusbarpanel = document.createElement("statusbarpanel");
    let statusbarBtn = document.createElement("toolbarbutton");
    statusbarBtn.id = "ae-clippings-icon";
    statusbarBtn.setAttribute("context", "ae-clippings-popup");
    statusbarBtn.setAttribute("tooltiptext", this.strBundle.getString("appName"));

    statusbarBtn.addEventListener("command", aEvent => {
      window.aecreations.clippings.openClippingsManager();
    }, false);

    statusbarpanel.appendChild(statusbarBtn);
    statusBar.appendChild(statusbarpanel);

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
    if (this.aeUtils.getOS() == "Darwin") {
      if (! this.aeUtils.hasPref("clippings.clipmgr.disable_js_window_geometry_persistence")) {
	this.aeUtils.setPref("clippings.clipmgr.disable_js_window_geometry_persistence", true);
      }
    }

    this.isClippingsInitialized = true;
  }
};


ChromeUtils.import("resource://clippings/modules/aeConstants.js",
		   window.aecreations.clippings);
ChromeUtils.import("resource://clippings/modules/aeString.js",
                   window.aecreations.clippings);
ChromeUtils.import("resource://clippings/modules/aeUtils.js",
                   window.aecreations.clippings);
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js",
		   window.aecreations.clippings);
ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js",
		   window.aecreations.clippings);
ChromeUtils.import("resource://clippings/modules/aeClippings3.js",
                   window.aecreations.clippings);
ChromeUtils.import("resource://clippings/modules/aePrefMigrator.js",
		   window.aecreations.clippings);

//
// Event handler initialization
//

window.addEventListener("load", window.aecreations.clippings, false);
window.addEventListener("unload", window.aecreations.clippings, false);
