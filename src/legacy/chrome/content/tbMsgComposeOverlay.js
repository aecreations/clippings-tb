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
  isClippingsInitialized: false,
  showDialog:             true,
  showPasteOpts:          false,
  strBundle:              null,
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

    let profilePath = this.util.aeUtils.getUserProfileDir().path;
    let dsPath = this.preferences.getPref("clippings.datasource.location", profilePath);
    
    // Clippings backup
    var backupDirURL = this.util.aeUtils.getDataSourcePathURL() + this.cnst.aeConstants.BACKUP_DIR_NAME;

    this.clippingsSvc.setBackupDir(backupDirURL);
    this.clippingsSvc.setMaxBackupFiles(this.preferences.getPref("clippings.backup.maxfiles", 10));
    **/
    // Initializing data source on Clippings context menus
    var menu1 = document.getElementById("ae-clippings-menu-1");
    var popup1 = document.getElementById("ae-clippings-popup-1");
    await this.initClippingsPopup(popup1, menu1);

    this.util.aeUtils.log(this.str.aeString.format("gClippings.initClippings(): Initializing Clippings integration with host app window: %s", window.location.href));
    /**
    // Add null clipping to root folder if there are no items
    if (this.preferences.getPref("clippings.datasource.process_root", true) == true) {
      this.clippingsSvc.processRootFolder();
      this.preferences.setPref("clippings.datasource.process_root", false);
    }

    let syncClippings = this.preferences.getPref("clippings.datasource.wx_sync.enabled", false);
    if (syncClippings) {
      this.util.aeUtils.log("gClippings.initClippings(): Sync Clippings is turned on. Refreshing the Synced Clippings folder.");
      let syncDirPath = this.preferences.getPref("clippings.datasource.wx_sync.location", "");
      if (! syncDirPath) {
	syncDirPath = this.preferences.getPref("clippings.datasource.location", "");
	this.preferences.setPref("clippings.datasource.wx_sync.location", syncDirPath);
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
	this.preferences.setPref("clippings.clipmgr.disable_js_window_geometry_persistence", true);
      }
    }
    **/
    // Enable/disable Clippings paste using the keyboard.
    let keyEnabled = this.preferences.getPref("keyboardPaste", true);
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
      let newKeysEnabled = this.preferences.getPref("wxPastePrefixKey", true);
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
    var txt = this.util.aeUtils.getTextFromClipboard();
    if (! txt) {
      var clippingsBtn = document.getElementById("ae-clippings-icon");
      var panel = document.getElementById("ae-clippings-clipboard-alert");
      panel.openPopup(clippingsBtn, "after_pointer", 0, 0, false, false);
      return;
    }

    this.getMxListener().newClippingDlgOpened(txt);
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
      this.getMxListener().newClippingDlgOpened(selection);
    }
    else {
      this.alert(this.strBundle.getString("errorNoSelection"));
    }
  },


  openClippingsManager: function () 
  {
    this.getMxListener().clippingsManagerWndOpened();
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
      await this.insertClipping(clippingID);
    };

    this._menu.build();
    
    this.util.aeUtils.log("gClippings.initClippingsPopup(): Data source initialization completed.");
  },


  async insertClipping(aID)
  {
    // Must explicitly close the message compose context menu - otherwise it
    // may reappear while the paste options dialog is open.
    var cxtMenu = document.getElementById("msgComposeContext");
    cxtMenu.hidePopup();

    let clipping = await this.getMxListener().clippingRequested(aID);

    var clippingInfo = this.txt.aeClippingSubst.getClippingInfo(
      aID, clipping.name, clipping.text, clipping.parentFolderName
    );
    var clippingText = this.txt.aeClippingSubst.processClippingText(clippingInfo, window);
    var pasteAsQuotation = false;
    
    // Paste clipping into subject line
    var focusedElt = document.commandDispatcher.focusedElement;
    if (focusedElt instanceof HTMLInputElement) {
      var textbox = focusedElt;
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
          var showHTMLPasteOpts = this.preferences.getPref("htmlPaste", this.cnst.aeConstants.HTMLPASTE_ASK_THE_USER);
	  
          if (showHTMLPasteOpts == this.cnst.aeConstants.HTMLPASTE_ASK_THE_USER) {
            var dlgArgs = { userCancel: null, pasteAsRichText: null };
            window.openDialog("chrome://clippings/content/htmlClipping.xhtml", "htmlClipping_dlg", "chrome,modal,centerscreen", dlgArgs);
	      
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

      var autoLineBreak = this.preferences.getPref("autoLineBreak", true);
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


  async keyboardInsertClipping(aEvent)
  {
    function sortKeyMap(aKeyMap)
    {
      let rv = new Map();
      let keys = [];

      aKeyMap.forEach((aValue, aKey, aMap) => { keys.push(aKey) });
      keys = keys.sort();

      for (let i = 0; i < keys.length; i++) {
	let clippingInfo = aKeyMap.get(keys[i]);
	rv.set(keys[i], clippingInfo);
      }

      return rv;
    }
    
    this._menu.rebuild();

    let dlgArgs = {
      SHORTCUT_KEY_HELP: 0,
      ACTION_SHORTCUT_KEY: 1,
      ACTION_SEARCH_CLIPPING: 2,
      action: null,
      switchModes: null,
      lastMode: null,
      clippingID: null,
      keyMap: null,
      keyCount: null,
      srchData: null,
      userCancel: null
    };

    let unsortedKeyMap = await this.getMxListener().shortcutKeyMapRequested();
    let keyMap = sortKeyMap(unsortedKeyMap);

    dlgArgs.keyMap = keyMap;
    dlgArgs.keyCount = keyMap.size;
    dlgArgs.srchData = await this.getMxListener().clippingSearchDataRequested();
    
    // Remember the last mode (shortcut key or search clipping by name).
    dlgArgs.action = this.preferences.getPref("pastePromptAction", dlgArgs.ACTION_SHORTCUT_KEY);

    do {
      if (dlgArgs.action == dlgArgs.SHORTCUT_KEY_HELP) {
	dlgArgs.printToExtBrowser = true;
	dlgArgs.showInsertClippingCmd = true;

        window.openDialog("chrome://clippings/content/shortcutHelp.xhtml",
			  "clipkey_help", "centerscreen,resizable", dlgArgs);

	this.preferences.setPref("pastePromptAction", dlgArgs.ACTION_SHORTCUT_KEY);
        return;
      }
      else if (dlgArgs.action == dlgArgs.ACTION_SHORTCUT_KEY) {
        window.openDialog("chrome://clippings/content/clippingKey.xhtml",
                          "clipkey_dlg", "modal,centerscreen", dlgArgs);
      }
      else if (dlgArgs.action == dlgArgs.ACTION_SEARCH_CLIPPING) {
        window.openDialog("chrome://clippings/content/searchClipping.xhtml",
                          "clipsrch_dlg", "modal,centerscreen", dlgArgs);
      }
    } while (dlgArgs.switchModes && !dlgArgs.userCancel);

    // Remember the paste shortcut mode for next time.
    this.preferences.setPref("pastePromptAction", dlgArgs.action);

    if (dlgArgs.userCancel) {
      return;
    }

    if (dlgArgs.clippingID) {
      this.insertClipping(dlgArgs.clippingID);
    }
  }
};

window.aecreations.clippings.cnst = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
window.aecreations.clippings.str = ChromeUtils.import("resource://clippings/modules/aeString.js");
window.aecreations.clippings.util = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
window.aecreations.clippings.ui = ChromeUtils.import("resource://clippings/modules/aeClippingsMenu.js");
window.aecreations.clippings.txt = ChromeUtils.import("resource://clippings/modules/aeClippingSubst.js");
window.aecreations.clippings.ins = ChromeUtils.import("resource://clippings/modules/aeInsertTextIntoTextbox.js");
