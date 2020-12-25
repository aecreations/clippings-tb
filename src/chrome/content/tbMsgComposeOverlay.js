/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Integration with host application
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
  showPasteOpts:          false,
  clippingsSvc:           null,
  strBundle:              null,
  _clippingsListener:     null,
  _isErrMenuItemVisible:  false,
  _ds:                    null,
  _menu:                  null,
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
    // Workaround to this init function being called multiple times
    if (this.isClippingsInitialized) {
      return;
    }

    this.strBundle = this.util.aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
    this.txt.aeClippingSubst.init(this.strBundle, navigator.userAgent);
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
    
    // Clippings backup
    var backupDirURL = this.util.aeUtils.getDataSourcePathURL() + this.cnst.aeConstants.BACKUP_DIR_NAME;
    /**
    this.clippingsSvc.setBackupDir(backupDirURL);
    this.clippingsSvc.setMaxBackupFiles(this.util.aeUtils.getPref("clippings.backup.maxfiles", 10));
    **/
    // Initializing data source on Clippings context menus
    var menu1 = document.getElementById("ae-clippings-menu-1");
    var popup1 = document.getElementById("ae-clippings-popup-1");
    await this.initClippingsPopup(popup1, menu1);

    this.util.aeUtils.log(this.str.aeString.format("gClippings.initClippings(): Initializing Clippings integration with host app window: %s", window.location.href));
    /**
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
    **/

    let composerCxtMenu = document.getElementById("msgComposeContext");
    composerCxtMenu.addEventListener("popupshowing", aEvent => {
      this.initContextMenuItem(aEvent);
    });

    /**
    let that = this;

    this._clippingsListener = {
      origin:  that.clippingsSvc.ORIGIN_HOSTAPP,

      dataSrcLocationChanged: function (aDataSrcURL) {
        var menu = document.getElementById("ae-clippings-menu-1");
        var popup = document.getElementById("ae-clippings-popup-1");

        // Reinitialize Clippings menu so that it points to the correct
        // datasource.
        that.initClippingsPopup(popup, menu);
      },

      syncLocationChanged: function (aSyncURL) {},
      newFolderCreated:    function (aFolderURI) {},
      newClippingCreated:  function (aClippingURI) {},
      importDone:          function (aNumItems) {}
    };

    this.clippingsSvc.addListener(this._clippingsListener);

    // Set behaviour of "New Clipping" commands - prompt vs. silent operation
    this.showDialog = true;

    // Initialize "New From Clipboard" command on status bar icon menu.
    var ellipsis = this.strBundle.getString("ellipsis");
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
    // Enable/disable Clippings paste using the keyboard.
    let keyEnabled = this.util.aeUtils.getPref("clippings.enable_keyboard_paste", true);
    let keyset = document.getElementById("tasksKeys");
    let keyElt = document.getElementById("key_ae_clippings");
    let keyEltMac = document.getElementById("key_ae_clippings_mac");
    let keyEltNew = document.getElementById("key_ae_clippings_new");
    let keyEltNewMac = document.getElementById("key_ae_clippings_new_mac");

    if (!keyEnabled && keyElt) {     
      keyset.removeChild(keyElt);
      keyset.removeChild(keyEltMac);
      keyset.removeChild(keyEltNew);
      keyset.removeChild(keyEltNewMac);
    }
    else {
      let newKeysEnabled = this.util.aeUtils.getPref("clippings.enable_wx_paste_prefix_key", true);
      if (! newKeysEnabled) {
	keyset.removeChild(keyEltNew);
	keyset.removeChild(keyEltNewMac);
      }
    }

    this.isClippingsInitialized = true;
  },


  initContextMenuItem: function (aEvent)
  {
    if (aEvent.target.id != "msgComposeContext") {
      return;
    }

    let that = this;
    let clippingsMenu = document.getElementById("ae-clippings-menu-1");

    this.getMxListener().clippingsDataRequested().then(aCxtMenuData => {
      that._menu.data = aCxtMenuData;
      that._menu.rebuild();

      var ellipsis = that.showDialog ? that.strBundle.getString("ellipsis") : "";
      var addEntryCmd = document.getElementById("ae_new_clipping_from_selection");
      var selection;

      if (clippingsMenu.id == "ae-clippings-menu-1") {
	selection = that.getSelectedText();
      }
      
      addEntryCmd.setAttribute("disabled", selection == "");
      addEntryCmd.setAttribute("label", that.strBundle.getString("newFromSelect")
			       + ellipsis);

      that._initAutoIncrementPlaceholderMenu();
    });
  },


  _initAutoIncrementPlaceholderMenu: function ()
  {
    var resetAutoIncrVarsMenuseparator = document.getElementById("reset-auto-increment-vars-separator");
    var resetAutoIncrVarsMenu = document.getElementById("reset-auto-increment-vars");
    var autoIncrVarsMenuPopup = document.getElementById("reset-auto-increment-vars-menu-popup");
    /***
    // Refresh the menu of auto-increment placeholders.
    while (autoIncrVarsMenuPopup.firstChild) {
      autoIncrVarsMenuPopup.removeChild(autoIncrVarsMenuPopup.firstChild);
    }

    var autoIncrementVars = this.txt.aeClippingSubst.getAutoIncrementVarNames();
    var numAutoIncrVars = autoIncrementVars.length;
    if (numAutoIncrVars == 0) {
    ***/
      resetAutoIncrVarsMenuseparator.style.display = "none";
      resetAutoIncrVarsMenu.style.display = "none";
    /***
    }
    else {
      resetAutoIncrVarsMenuseparator.style.display = "-moz-box";
      resetAutoIncrVarsMenu.style.display = "-moz-box";
      for (let i = 0; i < numAutoIncrVars; i++) {
        var menuItem = document.createElement("menuitem");
        menuItem.setAttribute("label", "#[" + autoIncrementVars[i] + "]");
        menuItem.setAttribute("value", autoIncrementVars[i]);

        let that = this;
        menuItem.addEventListener("command", function (evt) { that.txt.aeClippingSubst.resetAutoIncrementVar(evt.target.value); }, false);
        autoIncrVarsMenuPopup.appendChild(menuItem);
      }
    }
    ***/
  },


  unload: function ()
  {
    /**
    this.clippingsSvc.removeListener(this._clippingsListener);
    this._clippingsListener = null;
    **/
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
      // The RDF data source has to be initialized if it has not already been
      // done so, otherwise RDF node creation will fail, and the new Clippings
      // entry will never be created.
      // This initialization is done in the code for the Clippings popup menu's
      // `onpopupshowing' event handler.
      this.initClippingsPopup(document.getElementById("ae-clippings-popup-1"),
			      document.getElementById("ae-clippings-menu-1"));
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
    var focusedElt = document.commandDispatcher.focusedElement;

    this.util.aeUtils.log("gClippings.getSelectedText(): focusedElt = " + focusedElt);
    if (focusedElt instanceof HTMLInputElement) {
      // Subject line text box
      rv = focusedElt.value.substring(focusedElt.selectionStart, focusedElt.selectionEnd);
    }
    else {
      rv = focusedWnd.getSelection().toString();
    }

    return rv;
  },


  newFromSelection: function ()
  {
    // Must explicitly close the message compose context menu - otherwise it
    // will reappear while the New Clipping dialog is open if the Clippings 
    // submenu needs to be rebuilt.
    var cxtMenu = document.getElementById("msgComposeContext");
    cxtMenu.hidePopup();

    var selection = this.getSelectedText();
    if (selection) {
      this.getMxListener().newClippingDlgRequested(selection);
    }
    else {
      this.alert(this.strBundle.getString("errorNoSelection"));
    }
  },


  openClippingsManager: function () 
  {
    this.getMxListener().openingClippingsManager();
  },


  toggleShowPasteOptions: function ()
  {
    this.showPasteOpts = !this.showPasteOpts;
    document.getElementById("ae_clippings_show_paste_options").setAttribute("checked", this.showPasteOpts);
  },


  async initClippingsPopup(aPopup, aMenu) 
  {
    let cxtMenuData = await this.getMxListener().clippingsDataRequested();
    this._menu = this.ui.aeClippingsMenu.createInstance(aPopup, cxtMenuData);
    this._menu.menuItemCommand = async (aEvent) => {
      let menuItemID = aEvent.target.getAttribute("data-clipping-menuitem-id");
      let clippingID = Number(menuItemID.substring(menuItemID.lastIndexOf("-") + 1, menuItemID.indexOf("_")));
      let clipping = await this.getMxListener().clippingRequested(clippingID);
      this.insertClippingText(clipping.id, clipping.name, clipping.text, clipping.parentFolderName);
    };

    this._menu.build();
    
    this.dataSrcInitialized = true;
    this.util.aeUtils.log("gClippings.initClippingsPopup(): Data source initialization completed.");
  },


  insertClippingText: function (aID, aName, aText, aParentFolderName) 
  {
    // Must explicitly close the message compose context menu - otherwise it
    // may reappear while the paste options dialog is open.
    var cxtMenu = document.getElementById("msgComposeContext");
    cxtMenu.hidePopup();

    // TO DO: Get rid of placeholder for clipping URI - it was meant for
    // debugging purposes only and is undocumented.
    
    var clippingInfo = this.txt.aeClippingSubst.getClippingInfo(aID, aName, aText, aParentFolderName);
    var clippingText = this.txt.aeClippingSubst.processClippingText(clippingInfo, window);
    var pasteAsQuotation = false;
    var overwriteClipboard = this.util.aeUtils.getPref("clippings.use_clipboard", false);
    if (overwriteClipboard) {
      this.util.aeUtils.copyTextToClipboard(clippingText);
    }
    
    // Paste clipping into subject line
    var focusedElt = document.commandDispatcher.focusedElement;
    if (focusedElt instanceof HTMLInputElement) {
      let textbox = focusedElt;
      this.ins.aeInsertTextIntoTextbox(textbox, clippingText);
    }

    // If "Show Options When Pasting" is enabled, ask the user if the
    // clipping should be pasted as normal or quoted text.
    if (this.showPasteOpts) {
      var dlgArgs = { userCancel: null };
      window.openDialog("chrome://clippings/content/pasteOptions.xhtml", "ae_clippings_pasteopt_dlg", "chrome,centerscreen,modal", dlgArgs);

      if (dlgArgs.userCancel) {
        return;
      }

      pasteAsQuotation = dlgArgs.pasteOption == 1;
    }
    
    var contentFrame = document.getElementById("content-frame");
    var editor = contentFrame.getEditor(contentFrame.contentWindow);

    // Composing email in rich text (HTML)
    if (gMsgCompose.composeHTML) {
      var htmlEditor = editor.QueryInterface(Components.interfaces.nsIHTMLEditor);
      var hasHTMLTags = clippingText.search(/<[a-z1-6]+( [a-z]+(\="?.*"?)?)*>/i) != -1;
      var hasRestrictedHTMLTags = clippingText.search(/<\?|<%|<!DOCTYPE|(<\b(html|head|body|meta|script|applet|embed|object|i?frame|frameset)\b)/i) != -1;

      if (hasHTMLTags) {
        var pasteAsRichText;
        if (! hasRestrictedHTMLTags) {
          var showHTMLPasteOpts = this.util.aeUtils.getPref("clippings.html_paste", 0);
          if (showHTMLPasteOpts == this.cnst.aeConstants.HTMLPASTE_ASK_THE_USER) {
            var dlgArgs = { userCancel: null, pasteAsRichText: null };
            window.openDialog("chrome://clippings/content/htmlClipping.xul", "htmlClipping_dlg", "chrome,modal,centerscreen", dlgArgs);
	      
            if (dlgArgs.userCancel) {
              return;
            }
            pasteAsRichText = dlgArgs.pasteAsRichText;
          }
          else {
            pasteAsRichText = showHTMLPasteOpts == this.cnst.aeConstants.HTMLPASTE_AS_HTML;
          }
        }
        var plainTextClipping = clippingText;
	  
        if (!pasteAsRichText || hasRestrictedHTMLTags) {
          clippingText = clippingText.replace(/&/g, "&amp;");
          clippingText = clippingText.replace(/</g, "&lt;");
          clippingText = clippingText.replace(/>/g, "&gt;");
        }
      }
      else {
        // Could be plain text but with angle brackets, e.g. for denoting URLs
        // or email addresses, e.g. <joel_user@acme.com>, <http://www.acme.com>
        var hasOpenAngleBrackets = clippingText.search(/</) != -1;
        var hasCloseAngleBrackets = clippingText.search(/>/) != -1;

        if (hasOpenAngleBrackets) {
          clippingText = clippingText.replace(/</g, "&lt;");
        }
        if (hasCloseAngleBrackets) {
          clippingText = clippingText.replace(/>/g, "&gt;");	  
        }
      }

      var autoLineBreak = this.util.aeUtils.getPref("clippings.html_auto_line_break", true);
      var hasLineBreakTags = clippingText.search(/<br|<p/i) != -1;
      if (autoLineBreak && !hasLineBreakTags) {
        clippingText = clippingText.replace(/\n/g, "<br>");
      }
    }

    if (pasteAsQuotation) {
      if (gMsgCompose.composeHTML) {
        editor.insertAsCitedQuotation(clippingText, "", true);
      }
      else {
	editor.insertAsCitedQuotation(clippingText, "", false);
        editor.rewrap(true);
      }
      return;
    }
      
    if (gMsgCompose.composeHTML) {
      htmlEditor.insertHTML(clippingText);
    }
    else {
      editor.insertText(clippingText);
    }
  },


  _pasteClipping: function (aClippings)
  {
    try {
      // Paste clipping.  The following function is defined in
      // "chrome://global/content/globalOverlay.js"
      goDoCommand('cmd_paste');
      // SIDE EFFECT: The clipping text will remain on the system clipboard.
    }
    catch (e) {
      // Exception thrown if command is disabled or not applicable
      aClippings.aeUtils.beep();
    }
  },


  keyboardInsertClipping: function (aEvent)
  {
    this._menu.rebuild();
    
    var dlgArgs = {
      SHORTCUT_KEY_HELP: 0,
      ACTION_SHORTCUT_KEY: 1,
      ACTION_SEARCH_CLIPPING: 2,
      action: null,
      switchModes: null,
      clippingURI: null,
      userCancel: null
    };

    // Remember the last mode (shortcut key or search clipping by name).
    dlgArgs.action = this.util.aeUtils.getPref("clippings.paste_shortcut_mode", dlgArgs.ACTION_SHORTCUT_KEY);

    do {
      if (dlgArgs.action == dlgArgs.SHORTCUT_KEY_HELP) {
        let unsortedKeyMap = this.clippingsSvc.getShortcutKeyMap();
        let keys = [];

	unsortedKeyMap.forEach((aValue, aKey, aMap) => { keys.push(aKey) });
        keys = keys.sort();

        let keyCount = keys.length;
        let keyMap = {};

        for (let i = 0; i < keyCount; i++) {
          let clippingURI = unsortedKeyMap.get(keys[i]);
          let clippingName = this.clippingsSvc.getName(clippingURI);

          keyMap[keys[i]] = {
	    name: clippingName,
	    uri:  clippingURI
          };
        }

        let dlgArgs = {
          printToExtBrowser: true,
          keyMap:   keyMap,
	  keyCount: keyCount,
          showInsertClippingCmd: true
        };

        let dlg = window.openDialog("chrome://clippings/content/shortcutHelp.xul", "clipkey_help", "centerscreen,resizable", dlgArgs);
        this.util.aeUtils.log("Clippings: end of shortcut help action");
        return;
      }
      else if (dlgArgs.action == dlgArgs.ACTION_SHORTCUT_KEY) {
        let dlg = window.openDialog("chrome://clippings/content/clippingKey.xul",
                                    "clipkey_dlg", "modal,centerscreen", dlgArgs);
      }
      else if (dlgArgs.action == dlgArgs.ACTION_SEARCH_CLIPPING) {
        let dlg = window.openDialog("chrome://clippings/content/searchClipping.xul",
                                    "clipsrch_dlg", "modal,centerscreen", dlgArgs);
      }
    } while (dlgArgs.switchModes && !dlgArgs.userCancel);

    if (dlgArgs.userCancel) {
      return;
    }

    if (dlgArgs.clippingURI) {
      this.insertClippingText(dlgArgs.clippingURI,
                              this.clippingsSvc.getName(dlgArgs.clippingURI),
                              this.clippingsSvc.getText(dlgArgs.clippingURI));
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
	let msg = this.str.aeString.format("%s: %s",
			        this.strBundle.getString("errorAccessDenied"),
			        this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
	let msg = this.str.aeString.format("%s: %s",
			        this.strBundle.getString("errorFileLocked"),
			        this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
	let msg = this.str.aeString.format("%s: %s",
			        this.strBundle.getString("errorFileTooBig"),
			        this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_READ_ONLY) {
	let msg = this.str.aeString.format("%s: %s",
			        this.strBundle.getString("errorFileReadOnly"),
			        this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else if (e.result == Components.results.NS_ERROR_FILE_DISK_FULL) {
	let msg = this.str.aeString.format("%s: %s",
			        this.strBundle.getString("errorDiskFull"),
			        this.cnst.aeConstants.CLIPDAT_FILE_NAME);
	this.util.aeUtils.alertEx(title, msg);
      }
      else {
	this.util.aeUtils.alertEx(title, this.strBundle.getString("alertSaveFailed"));
      }
    }
  }
};

window.aecreations.clippings.cnst = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
window.aecreations.clippings.str = ChromeUtils.import("resource://clippings/modules/aeString.js");
window.aecreations.clippings.util = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
window.aecreations.clippings.ui = ChromeUtils.import("resource://clippings/modules/aeClippingsMenu.js");
/**
window.aecreations.clippings.svc = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

window.aecreations.clippings.hlpr = ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js");
**/
window.aecreations.clippings.txt = ChromeUtils.import("resource://clippings/modules/aeClippingSubst.js");
window.aecreations.clippings.ins = ChromeUtils.import("resource://clippings/modules/aeInsertTextIntoTextbox.js");

