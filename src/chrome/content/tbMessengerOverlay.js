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
    var result = this.hlpr.aeCreateClippingFromText(this.clippingsSvc, text, null, this.showDialog, window, null, false);

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
    var title = this.strBundle.getString("appName");
    this.util.aeUtils.alertEx(title, aMessage);
  },


  newFromClipboard: function () 
  {
    if (! this.dataSrcInitialized) {
      this.alert("ERROR: Clippings hasn't been initialized yet!");
      return;
    }

    var txt = this.util.aeUtils.getTextFromClipboard();
    if (! txt) {
      var clippingsBtn = document.getElementById("ae-clippings-icon");
      var panel = document.getElementById("ae-clippings-clipboard-alert");
      panel.openPopup(clippingsBtn, "after_pointer", 0, 0, false, false);
      return;
    }

    var result = this.hlpr.aeCreateClippingFromText(this.clippingsSvc, txt, null, this.showDialog, window, null, false);
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
    this.util.aeUtils.copyTextToClipboard(aText);

    try {
      // Paste clipping.  The following function is defined in
      // "chrome://global/content/globalOverlay.js"
      goDoCommand("cmd_paste");
      // SIDE EFFECT: The clipping text will remain on the system clipboard.
    }
    catch (e) {
      // Exception thrown if command is disabled or not applicable
      this.util.aeUtils.beep();
    }
  },


  saveClippings: function () 
  {
    let title = this.strBundle.getString("appName");
    let saveJSON = this.util.aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
    try {
      this.clippingsSvc.flushDataSrc(true, saveJSON);
    }
    catch (e) {
      if (e.result === undefined) {
	this.util.aeUtils.alertEx(title, this.strBundle.getString("alertSaveFailed"));
	return;
      }
      
      if (e.result == Components.results.NS_ERROR_NOT_INITIALIZED) {
	this.util.aeUtils.alertEx(title, this.strBundle.getString("errorSaveFailedDSNotInitialized"));
      }
      else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
	this.util.aeUtils.alertEx(title, this.strBundle.getString("errorOutOfMemory"));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
	var msg = this.str.aeString.format("%s: %s",
				this.strBundle.getString("errorAccessDenied"),
				this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
	var msg = this.str.aeString.format("%s: %s",
				this.strBundle.getString("errorFileLocked"),
				this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
	var msg = this.str.aeString.format("%s: %s",
				this.strBundle.getString("errorFileTooBig"),
				this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_READ_ONLY) {
	var msg = this.str.aeString.format("%s: %s",
				this.strBundle.getString("errorFileReadOnly"),
				this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_DISK_FULL) {
	var msg = this.str.aeString.format("%s: %s",
				this.strBundle.getString("errorDiskFull"),
				this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else {
	this.util.aeUtils.alertEx(title, this.strBundle.getString("alertSaveFailed"));
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

    this.strBundle = this.util.aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

    try {
      this.clippingsSvc = this.svc.aeClippingsService.getService();
    }
    catch (e) {
      this.alert(e);
    }

    this.clippingsSvc.setEmptyClippingString(this.strBundle.getString("emptyClippingLabel"));
    this.clippingsSvc.setSyncedClippingsFolderName(this.strBundle.getString("syncFldrLabel"));

    let profilePath = this.util.aeUtils.getUserProfileDir().path;
    let dsPath = this.util.aeUtils.getPref("clippings.datasource.location", profilePath);
    
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

    this.util.aeUtils.log(`initClippings(): Clippings data source successfully loaded.\nHost app: ${this.util.aeUtils.getHostAppName()} (version ${this.util.aeUtils.getHostAppVersion()})\nOS identifier: ${this.util.aeUtils.getOS()}\nInitializing Clippings integration with host app window: ${window.location.href}`);

    // Add null clipping to root folder if there are no items
    if (this.util.aeUtils.getPref("clippings.datasource.process_root", true) == true) {
      this.clippingsSvc.processRootFolder();
      this.util.aeUtils.setPref("clippings.datasource.process_root", false);
    }

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

    this.showDialog = true;

    // Place the status bar icon so that it appears as the last item, before
    // the window resizer grippy
    let statusBar = document.getElementById("status-bar");
    let statusbarpanel = document.createElement("hbox");
    let statusbarBtn = document.createElement("toolbarbutton");
    statusbarBtn.id = "ae-clippings-icon";
    statusbarBtn.setAttribute("context", "ae-clippings-popup");
    statusbarBtn.setAttribute("tooltiptext", this.strBundle.getString("appName"));

    statusbarBtn.addEventListener("command", aEvent => {
      window.aecreations.clippings.openClippingsManager();
    }, false);

    statusbarpanel.appendChild(statusbarBtn);
    statusBar.insertBefore(statusbarpanel, statusBar.lastChild);
    
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

    this.isClippingsInitialized = true;

    // Thunderbird 78 upgrade warning
    if (this.util.aeUtils.getPref("clippings.tb78.show_warning", true)) {
      this.util.aeUtils.openURLInNewTab("chrome://clippings/content/thunderbird78.xhtml");
    }
  }
};

window.aecreations.clippings.cnst = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
window.aecreations.clippings.str = ChromeUtils.import("resource://clippings/modules/aeString.js");
window.aecreations.clippings.util = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
window.aecreations.clippings.svc = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
window.aecreations.clippings.hlpr = ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js");


//
// Event handler initialization
//

window.addEventListener("load", window.aecreations.clippings, false);
window.addEventListener("unload", window.aecreations.clippings, false);
