/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Integration with host application
//

if (! ("aecreations" in window)) {
  window.aecreations = {};
}

if (! ("clippings" in window.aecreations)) {
  window.aecreations.clippings = {};
}
else {
  throw new Error("clippings object already defined");
}

window.aecreations.clippings = function () {
  var {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
  var {aeString} = ChromeUtils.import("resource://clippings/modules/aeString.js");
  var {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
  var {aeClippingsMenu} = ChromeUtils.import("resource://clippings/modules/aeClippingsMenu.js");
  var {aeClippingSubst} = ChromeUtils.import("resource://clippings/modules/aeClippingSubst.js");
  var {aeInsertTextIntoTextbox} = ChromeUtils.import("resource://clippings/modules/aeInsertTextIntoTextbox.js");

  let _isInitialized = false;
  let _showPasteOpts = false;
  let _ext = null;
  let _menu = null;
  let _clippingsMxListener = null;

  return {
    addMxListener(aListener)
    {
      _clippingsMxListener = aListener;
    },

    removeMxListener()
    {
      _clippingsMxListener = null;
    },

    getMxListener()
    {
      return _clippingsMxListener;
    },

    
    //
    // Browser window and Clippings menu initialization
    //

    async initClippings(aWL_extension)
    {   
      // Workaround to this init function being called multiple times
      if (_isInitialized) {
	return;
      }

      _ext = aWL_extension;

      aeClippingSubst.init(_ext, navigator.userAgent);

      // Initializing data source on Clippings context menus
      var menu1 = document.getElementById("ae-clippings-menu-1");
      var popup1 = document.getElementById("ae-clippings-popup-1");
      await this.initClippingsPopup(popup1, menu1);

      aeUtils.log(aeString.format("Clippings::tbMsgComposeOverlay.js: aecreations.clippings.initClippings(): Initializing Clippings integration with host app window: %s", window.location.href));

      let composerCxtMenu = document.getElementById("msgComposeContext");
      composerCxtMenu.addEventListener("popupshowing", async (aEvent) => {
	let prefs = await this.getMxListener().prefsRequested();
	this.initContextMenuItem.apply(this, [aEvent, prefs]);
      });

      _isInitialized = true;
    },


    async initContextMenuItem(aEvent, aPrefs)
    {
      if (aEvent.target.id != "msgComposeContext") {
	return;
      }

      let that = this;
      let mxListener = this.getMxListener();
      let clippingsMenu = document.getElementById("ae-clippings-menu-1");
      
      mxListener.clippingsMenuDataRequested(that._getMnuRootFldrID(aPrefs)).then(aCxtMenuData => {
	_menu.data = aCxtMenuData;
	_menu.rebuild();

	var addEntryCmd = document.getElementById("ae_new_clipping_from_selection");
	var selection;

	if (clippingsMenu.id == "ae-clippings-menu-1") {
	  selection = that.getSelectedText();
	}
	
	addEntryCmd.setAttribute("disabled", selection == "");
	addEntryCmd.setAttribute("label", _ext.localeData.localizeMessage("cxtMenuNewFromSel"));

	that._initAutoIncrementPlaceholderMenu();
      });
    },


    _getMnuRootFldrID: function (aPrefs)
    {
      const ROOT_FOLDER_ID = 0;
      
      let rv;
      rv = aPrefs.cxtMenuSyncItemsOnly ? aPrefs.syncFolderID : ROOT_FOLDER_ID;

      return rv;
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

      var autoIncrementVars = aeClippingSubst.getAutoIncrementVarNames();
      var numAutoIncrVars = autoIncrementVars.length;
      if (numAutoIncrVars == 0) {
	resetAutoIncrVarsMenuseparator.style.display = "none";
	resetAutoIncrVarsMenu.style.display = "none";
      }
      else {
	resetAutoIncrVarsMenuseparator.style.display = "-moz-box";
	resetAutoIncrVarsMenu.style.display = "-moz-box";
	for (let i = 0; i < numAutoIncrVars; i++) {
          var menuItem = document.createXULElement("menuitem");
          menuItem.setAttribute("label", "#[" + autoIncrementVars[i] + "]");
          menuItem.setAttribute("value", autoIncrementVars[i]);

          menuItem.addEventListener("command", aEvent => {
	    aeClippingSubst.resetAutoIncrementVar(aEvent.target.value);
	  });
          autoIncrVarsMenuPopup.appendChild(menuItem);
	}
      }
    },


    //
    // Methods invoked by overlay code
    //

    alert: function (aMessage)
    {
      var title = _ext.localeData.localizeMessage("extName");
      aeUtils.alertEx(title, aMessage);
    },


    newFromClipboard: function () 
    {
      var txt = aeUtils.getTextFromClipboard();
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

      aeUtils.log("Clippings::tbMsgComposeOverlay.js: aecreations.clippings.getSelectedText(): focusedElt = " + focusedElt);
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
	this.alert(_ext.localeData.localizeMessage("msgNoTextSel"));
      }
    },


    openClippingsManager: function () 
    {
      this.getMxListener().clippingsManagerWndOpened();
    },


    toggleShowPasteOptions: function ()
    {
      _showPasteOpts = !_showPasteOpts;
      document.getElementById("ae_clippings_show_paste_options").setAttribute("checked", _showPasteOpts);
    },


    async initClippingsPopup(aPopup, aMenu) 
    {
      let mxListener = this.getMxListener();
      let prefs = await mxListener.prefsRequested();
      let cxtMenuData = await mxListener.clippingsMenuDataRequested(this._getMnuRootFldrID(prefs));
      
      _menu = aeClippingsMenu.createInstance(aPopup, cxtMenuData);
      _menu.menuItemCommand = async (aEvent) => {
	let menuItemID = aEvent.target.getAttribute("data-clipping-menuitem-id");
	let clippingID = Number(menuItemID.substring(menuItemID.lastIndexOf("-") + 1, menuItemID.indexOf("_")));
	await this.insertClipping(clippingID);
      };

      _menu.build();
      
      aeUtils.log("Clippings::tbMsgComposeOverlay.js: aecreations.clippings.initClippingsPopup(): Data source initialization completed.");
    },


    async insertClipping(aID)
    {
      // Must explicitly close the message compose context menu - otherwise it
      // may reappear while the paste options dialog is open.
      let cxtMenu = document.getElementById("msgComposeContext");
      cxtMenu.hidePopup();

      let mxListener = this.getMxListener();
      let clipping = await mxListener.clippingRequested(aID);
      let prefs = await mxListener.prefsRequested();

      let clippingInfo = aeClippingSubst.getClippingInfo(
	aID, clipping.name, clipping.text, clipping.parentFolderName
      );
      let clippingText = aeClippingSubst.processClippingText(clippingInfo, window,
							     prefs.autoIncrPlchldrStartVal);
      let pasteAsQuotation = false;
      
      // Paste clipping into subject line
      let focusedElt = document.commandDispatcher.focusedElement;
      if (focusedElt instanceof HTMLInputElement) {
	let textbox = focusedElt;
	ins.aeInsertTextIntoTextbox(textbox, clippingText);
      }

      // If "Show Options When Pasting" is enabled, ask the user if the
      // clipping should be pasted as normal or quoted text.
      if (_showPasteOpts) {
	let dlgArgs = { userCancel: null };
	window.openDialog("chrome://clippings/content/pasteOptions.xhtml", "ae_clippings_pasteopt_dlg", "chrome,centerscreen,modal", dlgArgs, _ext);

	if (dlgArgs.userCancel) {
          return;
	}

	pasteAsQuotation = dlgArgs.pasteOption == 1;
      }
      
      let contentFrame = document.getElementById("messageEditor");
      if (! contentFrame) {
	// Thunderbird versions older than 102.0
	contentFrame = document.getElementById("content-frame");
      }
      let editor = contentFrame.getEditor(contentFrame.contentWindow);

      // Composing email in rich text (HTML)
      if (gMsgCompose.composeHTML) {
	editor = editor.QueryInterface(Components.interfaces.nsIHTMLEditor);	
	let hasHTMLTags = clippingText.search(/<[a-z1-6]+( [a-z]+(\="?.*"?)?)*>/i) != -1;
	let hasRestrictedHTMLTags = clippingText.search(/<\?|<%|<!DOCTYPE|(<\b(html|head|body|meta|script|applet|embed|object|i?frame|frameset)\b)/i) != -1;

	if (hasHTMLTags) {
          let pasteAsRichText;
          if (! hasRestrictedHTMLTags) {
	    pasteAsRichText = prefs.htmlPaste == aeConstants.HTMLPASTE_AS_HTML;
          }
	  
          if (!pasteAsRichText || hasRestrictedHTMLTags) {
            clippingText = clippingText.replace(/&/g, "&amp;");
            clippingText = clippingText.replace(/</g, "&lt;");
            clippingText = clippingText.replace(/>/g, "&gt;");
          }
	}
	else {
          // Could be plain text but with angle brackets, e.g. for denoting URLs
          // or email addresses, e.g. <joel_user@acme.com>, <http://www.acme.com>
          let hasOpenAngleBrackets = clippingText.search(/</) != -1;
          let hasCloseAngleBrackets = clippingText.search(/>/) != -1;

          if (hasOpenAngleBrackets) {
            clippingText = clippingText.replace(/</g, "&lt;");
          }
          if (hasCloseAngleBrackets) {
            clippingText = clippingText.replace(/>/g, "&gt;");	  
          }
	}

	let autoLineBreak = prefs.autoLineBreak;
	let hasLineBreakTags = clippingText.search(/<br|<p/i) != -1;
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
	editor.insertHTML(clippingText);
      }
      else {
	editor.insertText(clippingText);
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
      // END nested function

      let mxListener = this.getMxListener();
      let prefs = await mxListener.prefsRequested();
      if (! (prefs.keyboardPaste && prefs.wxPastePrefixKey)) {
	return;
      }
      
      _menu.rebuild();

      let dlgArgs = {
	SHORTCUT_KEY_HELP: 0,
	ACTION_SHORTCUT_KEY: 1,
	ACTION_SEARCH_CLIPPING: 2,
	hostAppVer: aeUtils.getHostAppVersion(),
	action: null,
	switchModes: null,
	lastMode: null,
	clippingID: null,
	keyMap: null,
	keyCount: null,
	srchData: null,
	userCancel: null
      };

      let unsortedKeyMap = await mxListener.shortcutKeyMapRequested();
      let keyMap = sortKeyMap(unsortedKeyMap);

      dlgArgs.keyMap = keyMap;
      dlgArgs.keyCount = keyMap.size;
      dlgArgs.srchData = await mxListener.clippingSearchDataRequested();
      
      // Remember the last mode (shortcut key or search clipping by name).
      dlgArgs.action = prefs.pastePromptAction;

      do {
	if (dlgArgs.action == dlgArgs.SHORTCUT_KEY_HELP) {
	  await mxListener.prefsChanged({ pastePromptAction: dlgArgs.ACTION_SHORTCUT_KEY });
	  mxListener.shortcutListWndOpened();
          return;
	}
	else if (dlgArgs.action == dlgArgs.ACTION_SHORTCUT_KEY) {
          window.openDialog("chrome://clippings/content/clippingKey.xhtml",
                            "clipkey_dlg", "modal,centerscreen", dlgArgs, _ext);
	}
	else if (dlgArgs.action == dlgArgs.ACTION_SEARCH_CLIPPING) {
          window.openDialog("chrome://clippings/content/searchClipping.xhtml",
                            "clipsrch_dlg", "modal,centerscreen", dlgArgs, _ext);
	}
      } while (dlgArgs.switchModes && !dlgArgs.userCancel);

      // Remember the paste shortcut mode for next time.
      await mxListener.prefsChanged({ pastePromptAction: dlgArgs.action });

      if (dlgArgs.userCancel) {
	return;
      }

      if (dlgArgs.clippingID) {
	this.insertClipping(dlgArgs.clippingID);
      }
    }
  };
}();
