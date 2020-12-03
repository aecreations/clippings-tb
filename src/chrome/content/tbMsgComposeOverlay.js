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
    this.util.aeUtils.alertEx("Clippings [XUL Overlay]", "The selection action is not available right now.");
  },


  toggleShowPasteOptions: function ()
  {
    this.showPasteOpts = !this.showPasteOpts;
    document.getElementById("ae_clippings_show_paste_options").setAttribute("checked", this.showPasteOpts);
  },


  initClippingsPopup: function (aPopup, aMenu) 
  {
    var err = false;
    var dsURL = this.util.aeUtils.getDataSourcePathURL() + this.cnst.aeConstants.CLIPDAT_FILE_NAME;
    try {
      this._ds = this.clippingsSvc.getDataSource(dsURL);
    }
    catch (e) {
      if (e.result === undefined) {
	err = this.strBundle.getString("errorInit");
      }
      else {
	if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
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
	  err = 888;
	}
      }
    }

    var errorMenuItem = document.getElementById("ae-clippings-error-menuitem");

    if (err) {
      // Append a new menu item that lets user see more details of error.
      if (errorMenuItem) {
	return;
      }

      var errorCmd = document.createElement("menuitem");
      errorCmd.id = "ae-clippings-error-menuitem";
      errorCmd.setAttribute("label", this.strBundle.getString("errorMenu"));
      errorCmd.style.fontWeight = "bold";

      var func;
      let that = this;
      if (err == 888) {
	func = function () { that.openClippingsManager() };
      }
      else {
	func = function () {
	  that.util.aeUtils.alertEx(that.strBundle.getString("appName"), err);
	};
      }
      errorCmd.addEventListener("command", func, false);
      aPopup.appendChild(errorCmd);
      this._isErrMenuItemVisible = true;
      return;
    }
    else {
      // Remove error menu item if error condition no longer exists
      if (errorMenuItem) {
	aPopup.removeChild(errorMenuItem);
	this._isErrMenuItemVisible = false;
      }
    }

    this._menu = this.ui.aeClippingsMenu.createInstance(aPopup);
    this._menu.menuItemCommand = aEvent => {
      let clippingURI = aEvent.target.getAttribute("data-clipping-uri");
      let clippingName = this.clippingsSvc.getName(clippingURI);
      let clippingContent = this.clippingsSvc.getText(clippingURI);
      this.insertClippingText(clippingURI, clippingName, clippingContent);
    };

    this._menu.build();
    
    this.dataSrcInitialized = true;
    this.util.aeUtils.log("gClippings.initClippingsPopup(): Data source initialization completed.");
  },


  insertClippingText: function (aURI, aName, aText) 
  {
    // Must explicitly close the message compose context menu - otherwise it
    // may reappear while the paste options dialog is open.
    var cxtMenu = document.getElementById("msgComposeContext");
    cxtMenu.hidePopup();

    var parentFolderURI = this.clippingsSvc.getParent(aURI);
    var folderName = this.clippingsSvc.getName(parentFolderURI);
    var clippingInfo = this.txt.aeClippingSubst.getClippingInfo(aURI, aName, aText,
                                                            folderName);
    var clippingText = this.txt.aeClippingSubst.processClippingText(clippingInfo,
                                                                window);
    var pasteAsQuotation = false;
    var overwriteClipboard = this.util.aeUtils.getPref("clippings.use_clipboard", 
						  false);
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
      window.openDialog("chrome://clippings/content/pasteOptions.xul", "ae_clippings_pasteopt_dlg", "chrome,centerscreen,modal", dlgArgs);

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
    else {
      // Composing email without formatting
      var plainTextEditor = editor.QueryInterface(Components.interfaces.nsIPlaintextEditor);
    }

    if (pasteAsQuotation) {
      var mailEditor = editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
      if (gMsgCompose.composeHTML) {
        mailEditor.insertAsCitedQuotation(clippingText, "", true);
      }
      else {
	mailEditor.insertAsCitedQuotation(clippingText, "", false);
        mailEditor.rewrap(true);
      }
      return;
    }
      
    if (gMsgCompose.composeHTML) {
      htmlEditor.insertHTML(clippingText);
    }
    else {
      plainTextEditor.insertText(clippingText);
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
  },


  //
  // Browser window and Clippings menu initialization
  //

  initClippings: function ()
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

    // Initializing data source on Clippings context menus
    var menu1 = document.getElementById("ae-clippings-menu-1");
    var popup1 = document.getElementById("ae-clippings-popup-1");
    this.initClippingsPopup(popup1, menu1);
**/
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

    // Attaching event handler to context menu 
    var hostAppContextMenu = document.getElementById("msgComposeContext");
    hostAppContextMenu.addEventListener("popupshowing", 
					this._initContextMenuItem, false);

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

    // Initialize status bar icon.
    let statusBar = document.getElementById("status-bar");
    let statusbarpanel = document.createElement("hbox");
    statusbarpanel.id = "ae-clippings-statubarpanel";
    let statusbarBtn = document.createElement("toolbarbutton");
    statusbarBtn.id = "ae-clippings-icon";
    statusbarBtn.setAttribute("context", "ae-clippings-popup");
    statusbarBtn.setAttribute("tooltiptext", this.strBundle.getString("appName"));

    statusbarBtn.addEventListener("command", aEvent => {
      window.aecreations.clippings.openClippingsManager();
    }, false);

    statusbarpanel.appendChild(statusbarBtn);
    statusBar.insertBefore(statusbarpanel, statusBar.lastChild);
    
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


  // To be invoked only by the `popupshowing' event handler on the host app
  // context menu.
  _initContextMenuItem: function (aEvent) {
    let that = window.aecreations.clippings;
    if (aEvent.target.id == "msgComposeContext") {
      that.initContextMenuItem.apply(that, arguments);
    }
  },


  initContextMenuItem: function (aEvent)
  {
    this.util.aeUtils.log("gClippings.initContextMenuItem(): Event target: " + aEvent.target + "; tag name: " + aEvent.target.tagName + "; id = `" + aEvent.target.id + "'");

    var clippingsMenu;

    if (aEvent.target.id == "msgComposeContext") {
      clippingsMenu = document.getElementById("ae-clippings-menu-1");
    }

    this._initCxtMenuItem(clippingsMenu);
  },


  _initCxtMenuItem: function (aMenupopup)
  {
    this.util.aeUtils.log("gClippings._initCxtMenuItem(): aMenupopup = " + aMenupopup + "; tag name: " + aMenupopup.tagName + "; id = `" + aMenupopup.id + "'");

    this._menu.rebuild();

    var ellipsis = this.showDialog ? this.strBundle.getString("ellipsis") : "";
    var addEntryCmd = document.getElementById("ae_new_clipping_from_selection");
    var selection;

    if (aMenupopup.id == "ae-clippings-menu-1") {
      selection = this.getSelectedText();
    }
  
    addEntryCmd.setAttribute("disabled", selection == "");
    addEntryCmd.setAttribute("label", this.strBundle.getString("newFromSelect")
			     + ellipsis);

    this._initAutoIncrementPlaceholderMenu();
  },


  initToolbarBtnCxtMenu: function (aEvent)
  {
    // No-op
  },


  _initAutoIncrementPlaceholderMenu: function ()
  {
    var resetAutoIncrVarsMenuseparator = document.getElementById("reset-auto-increment-vars-separator");
    var resetAutoIncrVarsMenu = document.getElementById("reset-auto-increment-vars");
    var autoIncrVarsMenuPopup = document.getElementById("reset-auto-increment-vars-menu-popup");

    // Refresh the menu of auto-increment placeholders.
    while (autoIncrVarsMenuPopup.firstChild) {
      autoIncrVarsMenuPopup.removeChild(autoIncrVarsMenuPopup.firstChild);
    }

    var autoIncrementVars = this.txt.aeClippingSubst.getAutoIncrementVarNames();
    var numAutoIncrVars = autoIncrementVars.length;
    if (numAutoIncrVars == 0) {
      resetAutoIncrVarsMenuseparator.style.display = "none";
      resetAutoIncrVarsMenu.style.display = "none";
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
  },


  unload: function ()
  {
    /**
    this.clippingsSvc.removeListener(this._clippingsListener);
    this._clippingsListener = null;
    **/
  }
};

window.aecreations.clippings.cnst = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
window.aecreations.clippings.str = ChromeUtils.import("resource://clippings/modules/aeString.js");
window.aecreations.clippings.util = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
/**
window.aecreations.clippings.svc = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
window.aecreations.clippings.ui = ChromeUtils.import("resource://clippings/modules/aeClippingsMenu.js");
window.aecreations.clippings.hlpr = ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js");
**/
window.aecreations.clippings.txt = ChromeUtils.import("resource://clippings/modules/aeClippingSubst.js");
/**
window.aecreations.clippings.ins = ChromeUtils.import("resource://clippings/modules/aeInsertTextIntoTextbox.js");
**/

