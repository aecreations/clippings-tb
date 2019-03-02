/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeString.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js");
ChromeUtils.import("resource://clippings/modules/aeInsertTextIntoTextbox.js");
ChromeUtils.import("resource://clippings/modules/aeClippingLabelPicker.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsTree.js");


const WINDOWSTATE_MAXIMIZE  = 1;
const WINDOWSTATE_MINIMIZE  = 2;
const WINDOWSTATE_NORMAL    = 3;

var gClippingsTree;
var gCurrentListItemIndex = -1;
var gStrBundle;
var gDataSource;
var gClippingsListener;
var gIsFolderMenuSeparatorInitialized = {};
var gSaveInProgress = false;
var gIsClippingsDirty = false;
var gJustMigrated = false;
var gJustImported = false;
var gMoveTimerID;
var gClippingLabelPicker, gClippingLabelPickerCxtMenu;
var gClippingDetailsPaneVisible;
var gAltClippingLabelPicker;


// Clippings XPCOM service
var gClippingsSvc;

let gStatusBar = {
  set label(aStatusText)
  {
    $("app-status").value = aStatusText;
  },

  get label()
  {
    return $("app-status").value;
  },
};

// Listener for the label picker in the main content area
let gClippingLabelPickerListener = {
  _btnID: null,

  init: function (aButtonID)
  {
    this._btnID = aButtonID;
  },

  selectionChanged: function (aNewLabel)
  {
    $(this._btnID).image = aeString.format("chrome://clippings/skin/images/%s", gClippingLabelPicker.getIconFileStr(aNewLabel));
  }
};


// Undo
var gUndoStack = {
  length: 0,
  _stack: [],

  push: function (aState)
  {
    this._stack.push(aState);
    this.length++;
  },

  pop: function ()
  {
    var rv = this._stack.pop();
    this.length--;
    return rv;
  }
};

// Redo - only 1 undo action is reversible
var gRedoStack = {
  length:   0,
  _lastUndo: null,

  push: function (aState)
  {
    this._lastUndo = aState;
    this.length = (this.length == 0 ? 1 : 1);
  },

  pop: function ()
  {
    var rv = {};
    for (let ppty in this._lastUndo) {
      rv[ppty] = this._lastUndo[ppty];
    }
    this._lastUndo = null;
    this.length = 0;
    return rv;
  }
};


// Flags for gUndoStack._stack[i].action
const ACTION_EDITNAME = 1;
const ACTION_EDITTEXT = 2;
const ACTION_DELETECLIPPING = 3;
const ACTION_CREATENEW = 4;
const ACTION_CHANGEPOSITION = 5;
const ACTION_CREATENEWFOLDER = 6;
const ACTION_DELETEFOLDER = 7;
const ACTION_MOVETOFOLDER = 8;
const ACTION_COPYTOFOLDER = 9;
const ACTION_DELETEEMPTYFOLDER = 10;
const ACTION_SETSHORTCUTKEY = 11;
const ACTION_SETLABEL = 12;

// Flags for aDestUndoStack parameter of functions for reversible actions
const UNDO_STACK = 1;
const REDO_STACK = 2;


//
// Page utility functions
//

function $(aID)
{
  return document.getElementById(aID);
}


function getParamsMap(aQueryStr)
{
  var rv = {};

  // aQueryStr is the value returned by window.location.search
  // It would be typically formatted such as "?foo=1&bar=baz"
  if (aQueryStr) {
    var search = aQueryStr.substring(1);

    var paramsArray = search.split("&");

    for (let i = 0; i < paramsArray.length; i++) {
      var param = paramsArray[i].split("=");
      rv[param[0]] = param[1];
    }
  }

  return rv;
}


//
// Drag 'n drop handlers for Clippings Manager's tree list
//

var dndStartPos = null;
var dndStartURI = null;
var dndExtText = null;

function initClippingsListDrag(aEvent)
{ 
  var index = gClippingsTree.tree.boxObject.getRowAt(aEvent.clientX, 
						     aEvent.clientY);
  var uri = gClippingsTree.getURIAtIndex(index);
  var pos = gClippingsSvc.ctrIndexOf(uri);

  dndStartURI = uri;
  dndStartPos = pos;

  if (gClippingsSvc.isClipping(uri)) {
    aEvent.dataTransfer.setData("text/plain", gClippingsSvc.getText(uri));
  }
  else if (gClippingsSvc.isFolder(uri)) {
    // Need to do this, or else drag and drop within the tree list won't work.
    aEvent.dataTransfer.setData("text/plain", "");
  }
}


function dropIntoClippingsList(aEvent)
{
  var dndData = aEvent.dataTransfer.getData("text/plain");

  if (dndData != "") {
    dndExtText = dndData;
  }
}


// TO DO: This is no longer used, so remove it.
var treeBuilderObserver = {
  canDrop: function (idx, orient)
  {
    // Return true to allow dropping into a folder.  Return the `orient' param
    // to allow dropping only if the folder is expanded in the tree list.
    return true;
  },

  onDrop: function (idx, orient)
  {
    updateCurrentClippingData();

    var uri = gClippingsTree.getURIAtIndex(idx);
    var newPos = gClippingsSvc.ctrIndexOf(uri);
    // `orient' is 0 (zero) if dragging and dropping into a folder item.
    var destParentURI = orient == 0 ? uri : gClippingsSvc.getParent(uri);

    aeUtils.log("DnD orientation: " + orient + "\nnewPos: " + newPos);

    if (! dndStartURI) {
      // Creating a new clipping from text that is dragged and dropped into
      // Clippings Manager from an external app.
      if (dndExtText) {
	if (orient == 1) {  // nsIXULTreeBuilderObserver.DROP_AFTER
	  newPos++;
	}
	else if (orient == 0) {  // nsIXULTreeBuilderObserver.DROP_ON
	  newPos = null;  // Will append to end of folder being dropped to.
	}
	var name = gClippingsSvc.createClippingNameFromText(dndExtText);
	var text = dndExtText;
        var srcURL = "";
	var newNodeURI = gClippingsSvc.createNewClippingEx(destParentURI, null, name, text, srcURL, gClippingsSvc.LABEL_NONE, newPos, true);

	// Always select the newly-created clipping.
	gClippingsTree.selectedURI = newNodeURI;
	gClippingsTree.ensureURIIsVisible(newNodeURI);
	gClippingsTree.click();
	
	var clippingName = $("clipping-name");
	clippingName.select();
	clippingName.focus();

	gUndoStack.push({action: ACTION_CREATENEW, uri: newNodeURI,
	      parentFolderURI: destParentURI, name: name, text: text,
              srcURL: srcURL, label: gClippingsSvc.LABEL_NONE
	});
	aeUtils.log(aeString.format("New entry added to undo stack\nName = %S", gClippingsSvc.getName(newNodeURI)));

	// Save the newly-created clipping.
	gIsClippingsDirty = true;
	commit();
      }
      else {
	aeUtils.beep();
	aeUtils.log("Unknown item dropped into tree list; ignoring.");
      }

      this._endDnD();
      return;
    }

    var srcParent = gClippingsSvc.getParent(dndStartURI);

    if (srcParent == destParentURI) {
      if (orient == 0) {  // nsIXULTreeBuilderObserver.DROP_ON
	// Dragging and dropping a folder item into its containing folder.
	aeUtils.beep();
	aeUtils.log("The selected item already belongs in this folder!");
	this._endDnD();
	return;
      }
      else if (orient == -1) { // nsIXULTreeBuilderObserver.DROP_BEFORE
	if (dndStartPos < newPos) newPos--;
      }
      else if (orient == 1) {  // nsIXULTreeBuilderObserver.DROP_AFTER
	if (dndStartPos > newPos) newPos++;
      }

      aeUtils.log(aeString.format("Orientation: %d\nChanging position from %d to %d", orient, dndStartPos, newPos));

      if (dndStartPos != newPos) {
	moveEntry(dndStartURI, srcParent, dndStartPos, newPos, UNDO_STACK);
	gClippingsTree.selectedURI = dndStartURI;
      }
    }
    else {
      if (dndStartURI == destParentURI) {
	aeUtils.beep();
	aeUtils.log("Cannot move a folder into itself!");
	this._endDnD();
	return;
      }

      // Prevent infinite recursion due to moving a folder into its own subfolder.
      if (gClippingsSvc.isFolder(dndStartURI)) {
	var parentURI = gClippingsSvc.getParent(destParentURI);
	while (parentURI && parentURI != gClippingsSvc.kRootFolderURI) {
	  if (parentURI == dndStartURI) {
	    aeUtils.beep();
	    aeUtils.log("Cannot move a folder into a subfolder of itself!");
	    this._endDnD();
	    return;
	  }
	  parentURI = gClippingsSvc.getParent(parentURI);
	}
      }

      if (orient == 1) {
	// nsIXULTreeBuilderObserver.DROP_AFTER
	newPos++;
      }
      else if (orient == 0) {
	// Dragging and dropping into a folder - append the item to be
	// moved as the last item of the folder.
	newPos = null;
      }

      aeUtils.log(aeString.format("Orientation: %d\nMoving to folder %S at position %d", orient, gClippingsSvc.getName(destParentURI), newPos));

      moveToFolderHelper(dndStartURI, srcParent, destParentURI, null, newPos,
			 UNDO_STACK, true);
    }

    updateDisplay();
    this._endDnD();
  },

  _endDnD: function ()
  {
    dndStartPos = null;
    dndStartURI = null;
    dndExtText = null;
  },
  
  canDropBeforeAfter: function (idx, orient) { return false; },
  canDropOn: function (idx, orient) { return true; },
  onSelectionChanged: function () {},
  onToggleOpenState: function (idx) {}
};

var gClippingsTreeEdit = {
  ACTION_CUT: 1,
  ACTION_COPY: 2,
  _uri: null,
  _srcFldrURI: null,
  _action: null,
  
  cut()
  {
    let selectedURI = gClippingsTree.selectedURI;
    if (! selectedURI) {
      aeUtils.log("clippingsMgr.js: gClippingsTreeEdit.cut(): ERROR: Unable to get selected URI!");
      return;
    }

    this._uri = selectedURI;
    this._srcFldrURI = gClippingsSvc.getParent(selectedURI);
    this._action = this.ACTION_CUT;

    $("cmd_paste").removeAttribute("disabled");
  },

  copy()
  {
    let selectedURI = gClippingsTree.selectedURI;
    if (! selectedURI) {
      aeUtils.log("clippingsMgr.js: gClippingsTreeEdit.copy(): ERROR: Unable to get selected URI!");
      return;
    }

    this._uri = selectedURI;
    this._srcFldrURI = gClippingsSvc.getParent(selectedURI);
    this._action = this.ACTION_COPY;

    $("cmd_paste").removeAttribute("disabled");
  },

  paste()
  {
    if (!this._uri || !this._action) {
      aeUtils.log("The selected action is not available right now.");
      return;
    }

    let selectedURI = gClippingsTree.selectedURI;
    let destFldrURI;
    if (gClippingsSvc.isFolder(selectedURI)) {
      destFldrURI = selectedURI;
    }
    else {
      destFldrURI = gClippingsSvc.getParent(selectedURI);
    }

    if (this._action == this.ACTION_CUT) {
      moveToFolderHelper(this._uri, this._srcFldrURI, destFldrURI, null, null, UNDO_STACK, true);
    }
    else if (this._action == this.ACTION_COPY) {
      copyToFolderHelper(this._uri, this._srcFldrURI, destFldrURI, null, null, UNDO_STACK, true);
    }
    
    this._uri = null;
    this._srcFldrURI = null;
    this._action = null;
    $("cmd_paste").setAttribute("disabled", "true");
  }
};


//
// QuickEdit - instant updating of clipping edits, without the need
// for a "Save" command to be manually invoked
//

var gQuickEdit = {
  _oldValue:       "",
  _tid:            null,
  _interval:       0,
  _targetEditElt:  null,
  _targetEditFn:   null,

  init: function (aTargetEditElt, aTargetEditFn)  {
    this._targetEditElt = aTargetEditElt;
    this._targetEditFn = aTargetEditFn;
    this._oldValue = this._targetEditElt.value;
    this._interval = aeUtils.getPref("clippings.clipmgr.quickedit.update_interval", 1000);
  },
  
  start: function () {
    this._tid = window.setInterval(function () { gQuickEdit._update(); }, this._interval);
  },
  
  isStarted: function () {
    return (this._tid != null);
  },

  stop: function () 
  {
    if (this._tid != null) {
      window.clearInterval(this._tid);
      this._tid = null;
      this._oldValue = "";
      this._targetEditElt = null;
      this._targetEditFn = null;
    }
  },

  _update: function () 
  {
    if (!gClippingsSvc || !gClippingsTree || gCurrentListItemIndex == -1) {
      this.stop();
      return;
    }

    var currentURI = gClippingsTree.selectedURI;
    if (!currentURI || !gClippingsSvc.exists(currentURI)) {
      this.stop();
      return;
    }

    aeUtils.debugBeep();

    var newValue = this._targetEditElt.value;

    if (newValue != this._oldValue) {
      this._targetEditFn(newValue);
      this._oldValue = newValue;
    }
  }
};


//
// Shortcut key editing
//

var gShortcutKey = {
  _oldKey:   "",
  _oldIndex: -1,
  
  setOldKey: function ()
  {
    if (gCurrentListItemIndex == -1) {
      return;
    }
    
    var clippingKey = document.getElementById("clipping-key");
    var uri = gClippingsTree.getURIAtIndex(gCurrentListItemIndex);
    this._oldKey = gClippingsSvc.getShortcutKey(uri);
    this._oldIndex = clippingKey.selectedIndex;
  },

  update: function (aDestUndoStack)
  {
    if (gCurrentListItemIndex == -1) {
      return;
    }

    var key = "";
    var uri = gClippingsTree.getURIAtIndex(gCurrentListItemIndex);
    var clippingKey = document.getElementById("clipping-key");

    if (clippingKey.selectedIndex == 0) {
      if (! this._oldKey) {
	// Skip shortcut key update if none was ever defined.
	return;
      }
    }
    else {
      key = clippingKey.menupopup.childNodes[clippingKey.selectedIndex].label;
    }

    if (key == this._oldKey) {
      return;
    }

    var keyMap = gClippingsSvc.getShortcutKeyMap();

    if (keyMap.has(key)) {
      doAlert(gStrBundle.getString("errorShortcutKeyDetail"));
      clippingKey.selectedIndex = this._oldIndex;
      return;
    }

    gClippingsSvc.setShortcutKey(uri, key);
    gIsClippingsDirty = true;

    var state = { 
      action:  ACTION_SETSHORTCUTKEY, 
      uri:     uri, 
      key:     this._oldKey,
      keyIdx:  this._oldIndex
    };

    if (aDestUndoStack == UNDO_STACK) {
      gUndoStack.push(state);
    }
    else if (aDestUndoStack == REDO_STACK) {
      gRedoStack.push(state);
    }
    commit();
  }
};


//
// Find bar - clipping search
//

var gFindBar = {
  // Constants
  FILTER_CLIPPINGS: 1,
  FILTER_CLIPPINGS_AND_FLDRS: 2,

  // Member variables
  _matchCase: false,
  _findBarElt: null,
  _findStatusElt: null,
  _srchResults: [],
  _srchResultsIdx: null,
  _expandedTreeRows: [],
  _updateSrchResults: false,
  _isSrchActivated: false,
  _srchFilter: null,
  _altFindBarFilterBtn: false,

  init: function ()
  {
    this._findBarElt = $("find-bar");
    this._findStatusElt = $("find-status");
    this._srchFilter = this.FILTER_CLIPPINGS;

    if (aeUtils.getOS() == "Darwin") {
      this._altFindBarFilterBtn = true;
      $("find-filter-menu").setAttribute("hidden", "true");
      $("find-filter-menu-btn").removeAttribute("hidden");
    }
  },

  show: function ()
  {
    this._findBarElt.collapsed = false;
  },

  hide: function () 
  {
    this._findBarElt.collapsed = true;
  },

  isVisible: function ()
  {
    return !this._findBarElt.collapsed;
  },

  isActivated: function ()
  {
    // Once a search has started, this flag stays `true' until the
    // Clippings Manager window is closed.
    return this._isSrchActivated;
  },

  setSearchResultsUpdateFlag: function ()
  {
    // Invoke this method whenever a search option is changed (filtering,
    // match case).
    this._updateSrchResults = true;
  },

  setFilter: function (aFilter)
  {
    this._srchFilter = aFilter;

    var findFilterBtnId = "find-filter-menu";
    findFilterBtnId += (this._altFindBarFilterBtn ? "-btn" : "");

    // Update the filter button image.
    if (this._srchFilter == this.FILTER_CLIPPINGS) {
      $(findFilterBtnId).className = "find-filter-clippings";
    }
    else if (this._srchFilter == this.FILTER_CLIPPINGS_AND_FLDRS) {
      $(findFilterBtnId).className = "find-filter-clippings-and-fldrs";
    }

    this.setSearchResultsUpdateFlag();
  },


  updateSearch: function (aSearchStr)
  {
    // Quick edit mode may still be active if the "Description" and "Text"
    // textboxes are still focused during search.
    if (gQuickEdit.isStarted()) {
      gQuickEdit.stop();
    }

    this._isSrchActivated = true;
    var srchFolders = (this._srchFilter == this.FILTER_CLIPPINGS_AND_FLDRS);
    this._srchResults = gClippingsSvc.findByName(aSearchStr, this._matchCase, srchFolders);
    var numResults = this._srchResults.length;

    if (numResults == 0) {
      this.reset();
      this._findStatusElt.value = gStrBundle.getString("findBarNotFound");
      aeUtils.beep();
    }
    else {
      this._srchResultsIdx = 0;
 
      if (aSearchStr) {
        this._findStatusElt.value = gStrBundle.getFormattedString("findBarMatches", [numResults]);
        this._selectSearchResult(this._srchResults[this._srchResultsIdx]);
      }
      else {
        this.reset();
        this._findStatusElt.value = "";
        gClippingsTree.selectedIndex = 0;
        updateDisplay();
      }
    }
  },

  _selectSearchResult: function (aClippingURI)
  {
    // Get the path to the clipping, expressed as an array where each element
    // is the folder URI.
    var pathToClipping = [];
    var parentFolderURI = gClippingsSvc.getParent(aClippingURI);
    while (parentFolderURI != gClippingsSvc.kRootFolderURI) {
      pathToClipping.unshift(parentFolderURI);
      parentFolderURI = gClippingsSvc.getParent(parentFolderURI);
    }

    // Go through the `pathToClipping' array and expand the tree rows of the
    // folders that are currently collapsed. Remember the tree rows that were
    // expanded so that they can be collapsed later (when user cancels search).
    for (let i = 0; i < pathToClipping.length; i++) {
      var idx = gClippingsTree.getIndexAtURI(pathToClipping[i]);
      if (! gClippingsTree.tree.view.isContainerOpen(idx)) {
        gClippingsTree.tree.view.toggleOpenState(idx);
        this._expandedTreeRows.unshift(idx);
      }
    }

    gClippingsTree.selectedURI = aClippingURI;
    gClippingsTree.ensureURIIsVisible(aClippingURI);
    updateDisplay();
  },

  findNext: function ()
  {
    if (this._updateSrchResults) {
      this.updateSearch($("find-clipping").value);
      this._updateSrchResults = false;
    }

    this._srchResultsIdx++;
    if (this._srchResultsIdx < this._srchResults.length) {
      this._selectSearchResult(this._srchResults[this._srchResultsIdx]);
    }
    else {
      aeUtils.beep();
      this._srchResultsIdx--;
    }
  },

  findPrev: function ()
  {
    if (this._updateSrchResults) {
      this.updateSearch($("find-clipping").value);
      this._updateSrchResults = false;
    }

    this._srchResultsIdx--;
    if (this._srchResultsIdx >= 0) {
      this._selectSearchResult(this._srchResults[this._srchResultsIdx]);
    }
    else {
      aeUtils.beep();
      this._srchResultsIdx++;
    }
  },

  toggleMatchCase: function ()
  {
    this._matchCase = !this._matchCase;
    this.setSearchResultsUpdateFlag();
  },

  reset: function ()
  {
    this._srchResults = [];
    this._srchResultsIdx = null;

    for (let i = 0; i < this._expandedTreeRows.length; i++) {
      gClippingsTree.tree.view.toggleOpenState(this._expandedTreeRows[i]);
    }
    this._expandedTreeRows = [];
  }
};


//
// Placeholder toolbar
//

var gPlaceholderBar = {
  _placeholderBarElt: null,

  init: function ()
  {
    this._placeholderBarElt = $("clipping-content-editor-toolbox");
  },

  show: function ()
  {
    this._placeholderBarElt.hidden = false;
  },

  hide: function ()
  {
    this._placeholderBarElt.hidden = true;
  },

  isVisible: function ()
  {
    return !this._placeholderBarElt.hidden;
  },

  isActivated: function ()
  {
    let rv = aeUtils.getPref("clippings.clipmgr.placeholder_toolbar", false);
    return rv;
  },

  setDisabledState: function (aDisabled)
  {
    $("placeholder-presets").disabled = aDisabled;
    $("placeholder-custom").disabled = aDisabled;
    $("placeholder-autoincrement").disabled = aDisabled;
  }
};


//
// Options bar (shortcut key and label)
//

var gOptionsBar = {
 _optionsBarElt: null,

 init: function ()
 {
   this._optionsBarElt = $("options-bar");
 },

 show: function () 
 {
   this._optionsBarElt.collapsed = false;
 },

 hide: function ()
 {
   this._optionsBarElt.collapsed = true;
 },

 isVisible: function ()
 {
   return !this._optionsBarElt.collapsed;
 }
};


//
// Common dialogs
//

function doAlert(aMessage)
{
  var title = gStrBundle.getString('appName');
  aeUtils.alertEx(title, aMessage);
}


function doConfirm(aMessage)
{
  var rv;
  var title = gStrBundle.getString('appName');
  rv = aeUtils.confirmEx(title, aMessage);
  return rv;
}



//
// Clippings Manager functions
//

function init() 
{
  if (isJSWindowGeometryPersistenceEnabled()) {
    setWindowGeometry();
  }

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    doAlert(e);
  }

  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  let treeElt = $("clippings-list");
  gClippingsTree = aeClippingsTree.createInstance(treeElt);
  gOptionsBar.init();
  gFindBar.init();

  setStatusBarVisibility();

  gPlaceholderBar.init();
  var isPlaceholderBarVisible = aeUtils.getPref("clippings.clipmgr.placeholder_toolbar", false);
  if (isPlaceholderBarVisible) {
    gPlaceholderBar.show();
  }

  gClippingDetailsPaneVisible = aeUtils.getPref("clippings.clipmgr.details_pane", false);
  if (! gClippingDetailsPaneVisible) {
    gOptionsBar.hide();
  }

  // Clipping label picker widgets
  let os = aeUtils.getOS();
  let btnMenuPopupID = "";
  let cxtMenuPopupID = "";

  if (os != "WINNT" && os != "Darwin") { 
    // Use the alternative color label picker menu
    gClippingLabelPickerListener.init("clipping-label-btn-2");
    btnMenuPopupID = "clipping-label-menupopup-2";
    cxtMenuPopupID = "clipping-label-cxt-menupopup-2";
    $("clipping-label-deck").selectedIndex = 1;
    $("clipping-label-cxt").style.display = "none";
    gAltClippingLabelPicker = true;
  }
  else {
    gClippingLabelPickerListener.init("clipping-label-btn");
    btnMenuPopupID = "clipping-label-menupopup";
    cxtMenuPopupID = "clipping-label-cxt-menupopup";
    $("clipping-label-deck").selectedIndex = 0;
    $("clipping-label-cxt-2").style.display = "none";
    gAltClippingLabelPicker = false;
  }

  gClippingLabelPicker = aeClippingLabelPicker.createInstance($(btnMenuPopupID));
  gClippingLabelPicker.addListener(gClippingLabelPickerListener);
  gClippingLabelPickerCxtMenu = aeClippingLabelPicker.createInstance($(cxtMenuPopupID));

  // Clippings backup
  var backupDirURL = aeUtils.getDataSourcePathURL() + aeConstants.BACKUP_DIR_NAME;
  gClippingsSvc.setBackupDir(backupDirURL);
  gClippingsSvc.setMaxBackupFiles(aeUtils.getPref("clippings.backup.maxfiles", 10));

  var recoveryMode = {};
  try {
    initDataSrc(recoveryMode);
  }
  catch (e) {
    return;
  }

  var numItems = gClippingsSvc.numItems;
  var deck = $("entry-properties");
  deck.selectedIndex = numItems == 0 ? 1 : 2;

  gClippingsTree.build();
  if (numItems > 0) {
    gClippingsTree.selectedIndex = 0;
    gClippingsTree.click();
    gClippingsTree.focus();
    gCurrentListItemIndex = 0;
  }

  if (recoveryMode.value) {
    aeUtils.beep();
    if (recoveryMode.value == doRecovery.IMPORT_FROM_DS_FILE
	|| recoveryMode.value == doRecovery.RECOVER_FROM_BACKUP) {
      gStatusBar.label = gStrBundle.getString('recoverySuccess');
    }
    else {
      // Started from a new, blank data source (doRecovery.CREATE_BLANK_DS
      // or doRecovery.FAILSAFE_CREATE_BLANK_DS)
      gStatusBar.label = gStrBundle.getString("clipdatFailsafeReset");
    }
  }
  else {
    updateItemCount();
  }

  gClippingsListener = {
    origin: gClippingsSvc.ORIGIN_CLIPPINGS_MGR,

    newClippingCreated: function (aClippingURI) {
      detectExternallyCreatedEntry(aClippingURI);
    },

    newFolderCreated: function (aFolderURI) {
      detectExternallyCreatedFolder(aFolderURI);
    },

    dataSrcLocationChanged: function (aDataSrcURL) {
      var recoveryMode = {};
      var oldDS = initDataSrc(recoveryMode);
      gClippingsTree.rebuild();
    },

    syncLocationChanged: function (aSyncURL) {
      gClippingsTree.rebuild();
    },

    importDone: function (aNumItems) {}
  };
  gClippingsSvc.addListener(gClippingsListener);

  if (aeUtils.getOS() == "Darwin") {
    // On Mac OS X, OS_TARGET is "Darwin"
    // Remove 0-9 as shortcut key choices; digits do not work on Mac OS X
    var clippingKeyPopup = $("clipping-key-popup");
    var digitMenuitems = [];
    for (let i = 0; i < clippingKeyPopup.childNodes.length; i++) {
      var child = clippingKeyPopup.childNodes[i];
      if (! isNaN(parseInt(child.label))) {
	digitMenuitems.push(child);
      }
    }

    while (digitMenuitems.length > 0) {
      clippingKeyPopup.removeChild(digitMenuitems.pop());
    }
  }

  var clippingNameElt = $("clipping-name");
  var clippingTextElt = $("clipping-text");
  var isSelectAllOnClickEnabled = aeUtils.getPref("clippings.clipmgr.select_text_on_click", false);

  if (isSelectAllOnClickEnabled) {
    clippingNameElt.clickSelectsAll = true;
    clippingTextElt.clickSelectsAll = true;
  }

  // Automatic spell checking
  var isSpellCheckingEnabled = aeUtils.getPref("clippings.check_spelling", true);

  if (isSpellCheckingEnabled) {
    clippingNameElt.setAttribute("spellcheck", "true");
    clippingTextElt.setAttribute("spellcheck", "true");
  }

  // Window geometry (size and position) persistence
  if (isJSWindowGeometryPersistenceEnabled()) {
    gMoveTimerID = window.setInterval(function () { windowMove(); }, 1000);
    window.onresize = windowResize;
  }

  var isTreeLinesEnabled = aeUtils.getPref("clippings.clipmgr.show_tree_lines", true);
  
  if (isTreeLinesEnabled) {
    treeElt.setAttribute("treelines", "true");
  }

  // First-run help
  if (aeUtils.getPref("clippings.clipmgr.first_run", true)) {
    window.setTimeout(function () { showHelp(); }, 1000);
    aeUtils.setPref("clippings.clipmgr.first_run", false);
  }
}


function initDataSrc(aRecoveryMode)
{
  // Return value is determined as follows:
  // - If initializing the data source for the first time in the Clippings Mgr
  //   session, then undefined is returned.
  // - If the datasource has already been initialized, then the datasource is
  //   reinitialized and the nsIRDFDataSource object of the previously-
  //   initialized datasource is returned.
  //
  // This function will be invoked by function init() and also in Clippings 
  // listener's dataSrcLocationChanged() handler.
  let rv;
  let dsURL = aeUtils.getDataSourcePathURL() + aeConstants.CLIPDAT_FILE_NAME;
  let ds;

  try {
    ds = gClippingsSvc.getDataSource(dsURL);
  }
  catch (e) {
    if (e.result === undefined) {
      doAlert(gStrBundle.getString("errorInit"));
      return;
    }
    
    if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
      doAlert(gStrBundle.getString("errorOutOfMemory"));
      throw e;
    }
    else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
      doAlert(aeString.format("%s: %s", gStrBundle.getString("errorAccessDenied"),
	  		      aeConstants.CLIPDAT_FILE_NAME));
      throw e;
    }
    else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
      doAlert(aeString.format("%s: %s", gStrBundle.getString("errorFileLocked"),
	  		      aeConstants.CLIPDAT_FILE_NAME));
      throw e;
    }
    else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
      doAlert(aeString.format("%s: %s", gStrBundle.getString("errorFileTooBig"),
			      aeConstants.CLIPDAT_FILE_NAME));
      throw e;
    }
    else {
      ds = doRecovery(dsURL, aRecoveryMode);
      if (! ds) {
	// Recovery failed
	throw "Automatic recovery failed";
      }
      aeUtils.log("Recovery method code: " + aRecoveryMode.value);
    }
  }

  rv = gDataSource;
  gDataSource = ds;

  return rv;
}


function detectExternallyCreatedEntry(aNewClippingURI)
{
  gClippingsTree.rebuild();

  // No effect if parent folder of new clipping isn't expanded.
  gClippingsTree.ensureURIIsVisible(aNewClippingURI); 
  gClippingsTree.selectedURI = aNewClippingURI;
  gClippingsTree.click();

  var state = {
    action: ACTION_CREATENEW, 
    uri:    aNewClippingURI, 
    name:   gClippingsSvc.getName(aNewClippingURI),
    text:   gClippingsSvc.getText(aNewClippingURI),
    srcURL: gClippingsSvc.getSourceURL(aNewClippingURI),
    label:  gClippingsSvc.getLabel(aNewClippingURI),
    key:    gClippingsSvc.getShortcutKey(aNewClippingURI),
    parentFolderURI: gClippingsSvc.getParent(aNewClippingURI)
  };
  gUndoStack.push(state);
  aeUtils.log(aeString.format("New entry named %S added to undo stack (created outside Clippings Manager!)", state.name));

  updateItemCount();
}


function detectExternallyCreatedFolder(aNewFolderURI)
{
  gClippingsTree.rebuild();
  gClippingsTree.ensureURIIsVisible(aNewFolderURI);
  gClippingsTree.selectedURI = aNewFolderURI;
  gClippingsTree.click();

  // Never add the "Synced Clippings" folder to the undo stack.
  if (aNewFolderURI != gClippingsSvc.kSyncFolderURI) {
    var state = {
      action: ACTION_CREATENEWFOLDER,
      uri:    aNewFolderURI,
      name:   gClippingsSvc.getName(aNewFolderURI),
      pos:    gClippingsSvc.indexOf(aNewFolderURI),
      parentFolderURI: gClippingsSvc.getParent(aNewFolderURI)
    };

    gUndoStack.push(state);
    aeUtils.log(aeString.format("New folder named %S added to undo stack (created outside Clippings Manager!)", state.name));
  }
  
  updateItemCount();
}


// This is called in Clippings Manager window's unload event handler
function unload()
{
  gClippingLabelPicker.removeListener(gClippingLabelPickerListener);

  gClippingsSvc.purgeDetachedItems();

  let retrySave;
  let doBackup = true;
  let saveJSON = this.aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);

  do {
    retrySave = false;
    try {
      gClippingsSvc.flushDataSrc(doBackup, saveJSON);
    }
    catch (e) {
      if (e.result === undefined) {
	doAlert(gStrBundle.getString("alertSaveFailed"));
	return;
      }
      
      if (e.result == Components.results.NS_ERROR_NOT_INITIALIZED) {
	doAlert(gStrBundle.getString("errorSaveFailedDSNotInitialized"));
      }
      else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
	doAlert(gStrBundle.getString("errorOutOfMemory"));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
	doAlert(aeString.format("%s: %s", gStrBundle.getString("errorAccessDenied"),
		 	        aeConstants.CLIPDAT_FILE_NAME));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
	doAlert(aeString.format("%s: %s", gStrBundle.getString("errorFileLocked"),
			        aeConstants.CLIPDAT_FILE_NAME));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_TOO_BIG) {
	doAlert(aeString.format("%s: %s", gStrBundle.getString("errorFileTooBig"),

				aeConstants.CLIPDAT_FILE_NAME));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_READ_ONLY) {
	doAlert(aeString.format("%s: %s", gStrBundle.getString('errorFileReadOnly'),
				aeConstants.CLIPDAT_FILE_NAME));
      }
      else if (e.result == Components.results.NS_ERROR_FILE_DISK_FULL) {
	doAlert(aeString.format("%s: %s", gStrBundle.getString("errorDiskFull"),
				aeConstants.CLIPDAT_FILE_NAME));
      }
      else {
	// Save failed for unknown reason - give the user the chance to try again
	var consoleSvc = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	var msg = aeString.format("Error from Clippings Manager: Error saving data source file - data source flush failed!\n\n%s", e);
	consoleSvc.logStringMessage(msg);

	retrySave = doConfirm(gStrBundle.getString("retrySave"));
      }
    }
  }
  while (retrySave);

  gClippingsSvc.removeListener(gClippingsListener);
  gClippingsListener = null;

  window.onresize = null;

  if (gMoveTimerID) {
    window.clearInterval(gMoveTimerID);
  }

  if (isJSWindowGeometryPersistenceEnabled()) {
    saveWindowGeometry();
  }
}


function doRecovery(aDataSrcURL, aRecoveryMode)
{
  doAlert(gStrBundle.getString("recoverFromCorruption"));

  try {
    var recoveredDataSrc = gClippingsSvc.recoverFromBackup();
    aRecoveryMode.value = doRecovery.RECOVER_FROM_BACKUP;
  }
  catch (e) {
    if (e.result === undefined) {
      doAlert(gStrBundle.getString("errorRecoveryFailed"));
      return false;
    }
    
    if (e.result == Components.results.NS_ERROR_FILE_NOT_FOUND) {
      var importFromFile = doConfirm(gStrBundle.getString("msgNoBackupDoImportOption"));
      try {
	gClippingsSvc.killDataSrc();
      }
      catch (e) {
	doAlert(gStrBundle.getString("errorCannotDeleteDSFile"));
	return false;
      }

      try {
	recoveredDataSrc = gClippingsSvc.getDataSource(aDataSrcURL);
      }
      catch (e) {
	doAlert(gStrBundle.getString("errorCannotRegenerateDS"));
	return false;
      }

      if (importFromFile) {
	var result;
	do {
	  result = doImport();
	} while (result == doImport.ERROR_CANNOT_IMPORT_DS
		 || result == doImport.ERROR_FILE_IO
		 || result == doImport.ERROR_FILE_UNREADABLE);

	if (result == doImport.USER_CANCEL) {
	  aRecoveryMode.value = doRecovery.CREATE_BLANK_DS;
	}
	else if (result == doImport.SUCCESS) {
	  aRecoveryMode.value = doRecovery.IMPORT_FROM_DS_FILE;
	}
	else {
	  aRecoveryMode.value = doRecovery.FAILSAFE_CREATE_BLANK_DS;
	}
      }
      else {
	aRecoveryMode.value = doRecovery.CREATE_BLANK_DS;
      }
    }
    else {
      doAlert(gStrBundle.getString("errorRecoveryFailed"));
      return false;
    }
  }
  
  return recoveredDataSrc;
}

// Constants indicating how data source recovery was performed.
doRecovery.RECOVER_FROM_BACKUP      = 1;
doRecovery.IMPORT_FROM_DS_FILE      = 2;
doRecovery.CREATE_BLANK_DS          = 3;
doRecovery.FAILSAFE_CREATE_BLANK_DS = 4;


function initReloadMenuItem() 
{
  if (aeUtils.PORTABLE_APP_BUILD) {
    $("reload_menuseparator").style.display = 'none';
    $("reload_menuitem").style.display = 'none';
  }
}


function applyUpdatedClippingsMgrPrefs()
{
  var isSpellCheckEnabled = aeUtils.getPref("clippings.check_spelling", true);
  var clippingNameElt = $("clipping-name");
  var clippingTextElt = $("clipping-text");

  if (isSpellCheckEnabled && !clippingNameElt.hasAttribute("spellcheck")) {
    clippingNameElt.setAttribute("spellcheck", "true");
    clippingTextElt.setAttribute("spellcheck", "true");
  }
  else if (!isSpellCheckEnabled && clippingNameElt.hasAttribute("spellcheck")) {
    clippingNameElt.removeAttribute("spellcheck");
    clippingTextElt.removeAttribute("spellcheck");
  }

  setStatusBarVisibility();
}


function setStatusBarVisibility()
{
  var showStatusBar = aeUtils.getPref("clippings.clipmgr.status_bar", true);
  $("status-bar").hidden = !showStatusBar;
}


function arrangeItemsByDnD()
{
  let selectedURI = gClippingsTree.selectedURI;
  let folders = [];
  let fldrName = "";
  let rootFldrName = gStrBundle.getString("appName");

  if (gClippingsSvc.isFolder(selectedURI)) {
    fldrName = gClippingsSvc.getName(selectedURI);
    let fldrItems = gClippingsSvc.getSubfolderItemsAsJSONString(selectedURI);
    folders.push({
      uri:  selectedURI,
      name: fldrName,
      items: JSON.parse(fldrItems)
    });

    // If the parent of the selected folder is the root folder, then also get
    // the root-level items.
    if (gClippingsSvc.getParent(selectedURI) == gClippingsSvc.kRootFolderURI) {
      let rootFldrItems = gClippingsSvc.getSubfolderItemsAsJSONString(gClippingsSvc.kRootFolderURI);
      folders.push({
	uri:  gClippingsSvc.kRootFolderURI,
	name: rootFldrName,
	items: JSON.parse(rootFldrItems)
      });
    }
  }
  else {
    let parentURI = gClippingsSvc.getParent(selectedURI);
    if (parentURI == gClippingsSvc.kRootFolderURI) {
      fldrName = rootFldrName;
    }
    else {
      fldrName = gClippingsSvc.getName(parentURI);
    }

    let fldrItems = gClippingsSvc.getSubfolderItemsAsJSONString(parentURI);
    folders.push({
      uri: parentURI,
      name: fldrName,
      items: JSON.parse(fldrItems)
    });
  }
  
  let dlgArgs = {
    folders,
    rearrangedItems: [],
    userCancel: null
  };

  window.openDialog("chrome://clippings/content/dndArrange.xhtml", "dlg_clippingsmgr_dndext", "centerscreen,modal", dlgArgs);

  if (dlgArgs.userCancel) {
    return;
  }
  
  for (let i = 0; i < dlgArgs.rearrangedItems.length; i++) {
    let item = dlgArgs.rearrangedItems[i];
    gClippingsSvc.changePosition(item.parentFolderURI, item.oldPos, item.newPos);
  }

  gClippingsTree.rebuild();
}


function closeNotificationBar()
{
  $("notification-bar").hidden = true;
}


function dataSrcOptions()
{
  // Open the extension preferences dialog, with the Data Source pane displayed
  window.openDialog("chrome://clippings/content/options.xul", "dlg_clippings_datasrc", "chrome,titlebar,toolbar,centerscreen,dialog=yes", "pane-datasource");
}


function clippingsMgrOptions()
{
  // Open the extension preferences dialog, with the Clippings Manager pane
  // displayed.
  window.openDialog("chrome://clippings/content/options.xul", "dlg_clippings_datasrc", "chrome,titlebar,toolbar,centerscreen,dialog=yes", "pane-clippings-mgr");
}


function updateItemCount()
{
  var count = gClippingsSvc.numItems;
  gStatusBar.label = gStrBundle.getFormattedString("itemCount", [count]);
}


function newFolder() 
{
  updateCurrentClippingData();

  var parentFolderURI, pos;
  var selectedURI = gClippingsTree.selectedURI;

  if (! selectedURI) {
    parentFolderURI = gClippingsSvc.kRootFolderURI;
  }
  else {
    parentFolderURI = gClippingsSvc.getParent(selectedURI);
    //pos = gClippingsSvc.indexOf(selectedURI);
  }

  var newFolderName = gStrBundle.getString('newFolderName');
  newFolderHelper(parentFolderURI, newFolderName, null, pos, UNDO_STACK);
}


function newFolderHelper(aParentFolderURI, aFolderName, aURI, aPos, aDestUndoStack)
{
  var newNodeURI = gClippingsSvc.createNewFolderEx(aParentFolderURI, aURI, aFolderName, aPos, false, gClippingsSvc.ORIGIN_CLIPPINGS_MGR);

  gClippingsTree.addFolderNode(aParentFolderURI, newNodeURI, aFolderName);
  gClippingsTree.selectedURI = newNodeURI;
  gClippingsTree.ensureURIIsVisible(newNodeURI);
  gClippingsTree.click();

  var deck = $("entry-properties");
  if (deck.selectedIndex != 0) {
    deck.selectedIndex = 0;
  }

  var folderName = $("clipping-name");
  folderName.select();
  folderName.focus();

  // Undo / redo
  var state = {
    action:  ACTION_CREATENEWFOLDER, 
    uri:     newNodeURI, 
    name:    aFolderName,
    pos:     aPos,
    parentFolderURI: aParentFolderURI
  };

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
    aeUtils.log(aeString.format("New entry %S added to undo stack", aFolderName));
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
    aeUtils.log(aeString.format("New entry %S added to redo stack", aFolderName));
  }

  gIsClippingsDirty = true;
  commit();
}


function newClipping() 
{
  updateCurrentClippingData();

  var parentFolderURI, pos;
  var selectedURI = gClippingsTree.selectedURI;

  if (! selectedURI) {
    parentFolderURI = gClippingsSvc.kRootFolderURI;
  }
  else {
    parentFolderURI = gClippingsSvc.getParent(selectedURI);
    //pos = gClippingsSvc.indexOf(selectedURI);
  }

  newClippingHelper(parentFolderURI,
		    gStrBundle.getString('newClippingName'), "", null, pos,
		    UNDO_STACK);
}


function newClippingHelper(aParentFolder, aName, aText, aURI, aPos, aDestUndoStack)
{
  newClippingHelperEx(aParentFolder, aName, aText, aURI, aPos, "", "", gClippingsSvc.LABEL_NONE, aDestUndoStack);
}


function newClippingHelperEx(aParentFolder, aName, aText, aURI, aPos, aShortcutKey, aSrcURL, aLabel, aDestUndoStack)
{
  var newNodeURI = gClippingsSvc.createNewClippingEx(aParentFolder, aURI, aName, aText, aSrcURL, aLabel, aPos, true);

  if (! newNodeURI) {
    doAlert(gStrBundle.getString('errorCannotCreate'));
    return;
  }
  
  if (aShortcutKey) {
    gClippingsSvc.setShortcutKey(newNodeURI, aShortcutKey);
  }

  gClippingsTree.addLeafNode(aParentFolder, newNodeURI, aName);
  gClippingsTree.selectedURI = newNodeURI;
  gClippingsTree.ensureURIIsVisible(newNodeURI);
  gClippingsTree.click();

  var deck = $("entry-properties");
  if (deck.selectedIndex != 0) {
    deck.selectedIndex = 0;
  }

  var clippingName = $("clipping-name");
  clippingName.select();
  clippingName.focus();

  var state = {
    action: ACTION_CREATENEW, uri: newNodeURI, name: aName, text: aText,
    srcURL: aSrcURL, label: aLabel, key: aShortcutKey,
    parentFolderURI: aParentFolder, pos: aPos
  };

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
    aeUtils.log(aeString.format("New entry %S added to undo stack", aName));
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
    aeUtils.log(aeString.format("New entry %S added to redo stack", aName));
  }

  gIsClippingsDirty = true;
  commit();
}


function pasteClippingAsNew()
{
  updateCurrentClippingData();

  var txt = aeUtils.getTextFromClipboard();
  if (! txt) {
    aeUtils.beep();
    
    let toolsMenu = $("clippings-options");
    let panel = $("ae-clippings-clipboard-alert");
    panel.openPopup(toolsMenu, "after_start", 0, 0, false, false);
    return;
  }

  var parentFolderURI;
  var selectedURI = gClippingsTree.selectedURI;
  if (! selectedURI) {
    parentFolderURI = gClippingsSvc.kRootFolderURI;
  }
  else {
    parentFolderURI = gClippingsSvc.getParent(selectedURI);
  }

  var newNodeURI;
  try {
    newNodeURI = aeCreateClippingFromText(gClippingsSvc, txt, null, false,
		 			  window, parentFolderURI, true);
  }
  catch (e) {
    doAlert(gStrBundle.getString("newFromClipboardError"));
  }

  if (! newNodeURI) {
    doAlert(gStrBundle.getString("errorCannotCreate"));
    return;
  }

  let newClippingName = gClippingsSvc.getName(newNodeURI);
  gClippingsTree.addLeafNode(parentFolderURI, newNodeURI, newClippingName);
  gClippingsTree.selectedURI = newNodeURI;
  gClippingsTree.ensureURIIsVisible(newNodeURI);
  gClippingsTree.click();

  var deck = $("entry-properties");
  if (deck.selectedIndex != 0) {
    deck.selectedIndex = 0;
  }

  var clippingName = $("clipping-name");
  clippingName.select();
  clippingName.focus();

  gUndoStack.push({action: ACTION_CREATENEW, uri: newNodeURI,
	           parentFolderURI: parentFolderURI,
		   name: gClippingsSvc.getName(newNodeURI),
                   text: gClippingsSvc.getText(newNodeURI),
                   srcURL: "", label: gClippingsSvc.LABEL_NONE});
  aeUtils.log(aeString.format("New entry added to undo stack\nName = %S", 
			       gClippingsSvc.getName(newNodeURI)));

  gIsClippingsDirty = true;
  commit();

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}


function moveOrCopy()
{
  if (gClippingsTree.getRowCount() == 0) {
    aeUtils.beep();
    return;
  }

  let uri = gClippingsTree.selectedURI;
  if (! uri) {
    return;
  }

  if (gClippingsSvc.isEmptyClipping(uri)) {
    aeUtils.beep();
    return;
  }

  let isSyncClippings = aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
  if (uri == gClippingsSvc.kSyncFolderURI && isSyncClippings) {
    doAlert(gStrBundle.getString("moveSyncFldr"));
    return;
  }
  
  let dlgArgs = {
    userCancel: null,
    destFolderURI: gClippingsSvc.kRootFolderURI,
    createCopy: false,
  };

  window.openDialog("chrome://clippings/content/moveToFolder.xul", "dlg_clippings_mgr_moveto", "modal,centerscreen", dlgArgs);

  if (dlgArgs.userCancel) {
    return;
  }

  if (dlgArgs.createCopy) {
    copyToFolderEx(dlgArgs.destFolderURI);
  }
  else {
    moveToFolderEx(dlgArgs.destFolderURI);
  }
}


function copyToFolder(aDestFolderURI)
{
  // We have to do this, otherwise if the Move button was clicked, it will
  // have the sunken look again when the mouse is hovered over it later.
  window.setTimeout(function () { copyToFolderEx(aDestFolderURI); }, 10);  
}


function copyToFolderEx(aDestFolderURI)
{
  updateCurrentClippingData();

  var destFolderURI = aDestFolderURI;
  var itemURI = gClippingsTree.selectedURI;
  var parentFolderURI = gClippingsSvc.getParent(itemURI);

  // Prevent infinite recursion due to copying a folder into its own subfolder.
  if (gClippingsSvc.isFolder(itemURI)) {
    var parentURI = gClippingsSvc.getParent(aDestFolderURI);
    while (parentURI && parentURI != gClippingsSvc.kRootFolderURI) {
      if (parentURI == itemURI) {
	aeUtils.beep();
	aeUtils.log("Cannot copy a folder into a subfolder of itself!");
	return;
      }
      parentURI = gClippingsSvc.getParent(parentURI);
    }
  }

  copyToFolderHelper(itemURI, parentFolderURI, destFolderURI, null, null, UNDO_STACK, true);
}


function copyToFolderHelper(aItemURI, aSrcFolderURI, aDestFolderURI, aDestItemURI, aDestPos, aDestUndoStack, aSelectCopiedItem)
{
  var prevIndex = gClippingsTree.selectedIndex;
  var newURI = gClippingsSvc.copyTo(aItemURI, aDestFolderURI, aDestItemURI,
				    aDestPos, false,
				    gClippingsSvc.ORIGIN_CLIPPINGS_MGR);

  aeUtils.log(aeString.format("Copy completed.  Name of copied item: %S\nParent folder of copied item: %S", gClippingsSvc.getName(aItemURI), gClippingsSvc.getName(aDestFolderURI)));

  // The Clippings tree context menu doesn't close automatically after the
  // copy or move operation.
  $("clippings-list-context").hidePopup();

  var state = {
    action:       ACTION_COPYTOFOLDER,
    copyURI:      newURI,
    originalURI:  aItemURI,
    srcFolder:    aSrcFolderURI
  };

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
  }

  gClippingsTree.rebuild();
  updateDisplay();

  if (aSelectCopiedItem) {
    gClippingsTree.ensureURIIsVisible(newURI);
    gClippingsTree.selectedURI = newURI;
    gClippingsTree.click();
  }
  else {
    var numRows = gClippingsTree.getRowCount();
    if (prevIndex == numRows) {  // Copied item was last list item.
      gClippingsTree.selectedIndex = numRows - 1;
      gClippingsTree.ensureIndexIsVisible(numRows - 1);
    }
    else {
      gClippingsTree.selectedIndex = prevIndex;
      gClippingsTree.ensureIndexIsVisible(prevIndex);
    }
  }

  updateItemCount();
  gIsClippingsDirty = true;
  commit();

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}


function moveToFolder(aDestFolderURI)
{
  // We have to do this, otherwise if the Move button was clicked, it will
  // have the pressed-down look again when the mouse is hovered over it later.
  window.setTimeout(function () { moveToFolderEx(aDestFolderURI); }, 10);
}


function moveToFolderEx(aDestFolderURI)
{
  updateCurrentClippingData();

  var destFolderURI = aDestFolderURI;
  var itemURI = gClippingsTree.selectedURI;

  if (gClippingsSvc.isFolder(itemURI) && itemURI == destFolderURI) {
    aeUtils.beep();
    aeUtils.log("Cannot move a folder into itself!");
    return;
  }

  // It is pointless to move an item into the same folder.
  var parentFolderURI = gClippingsSvc.getParent(itemURI);
  if (parentFolderURI == destFolderURI) {
    aeUtils.beep();
    aeUtils.log("The source and destination folders are the same!");
    return;
  }

  // Prevent infinite recursion due to moving a folder into its own subfolder.
  if (gClippingsSvc.isFolder(itemURI)) {
    var parentURI = gClippingsSvc.getParent(aDestFolderURI);
    while (parentURI && parentURI != gClippingsSvc.kRootFolderURI) {
      if (parentURI == itemURI) {
	aeUtils.beep();
	aeUtils.log("Cannot move a folder into a subfolder of itself!");
	return;
      }
      parentURI = gClippingsSvc.getParent(parentURI);
    }
  }

  moveToFolderHelper(itemURI, parentFolderURI, destFolderURI, null, null, UNDO_STACK, true);
}


function moveToFolderHelper(aItemURI, aSrcFolderURI, aDestFolderURI, aDestItemURI, aDestPos, aDestUndoStack, aSelectMovedItem)
{
  var pos = gClippingsSvc.indexOf(aItemURI);
  var prevIndex = gClippingsTree.selectedIndex;
  var newURI = gClippingsSvc.copyTo(aItemURI, aDestFolderURI, aDestItemURI,
				    aDestPos, true,
				    gClippingsSvc.ORIGIN_CLIPPINGS_MGR);

  aeUtils.log(aeString.format("Move completed.  Name of moved item: %S\nParent folder the item was moved to: %S", gClippingsSvc.getName(newURI), gClippingsSvc.getName(aDestFolderURI)));

  // The Clippings tree context menu doesn't close automatically after the
  // copy or move operation.
  $("clippings-list-context").hidePopup();

  var state = {
    action: ACTION_MOVETOFOLDER,
    uri:    newURI,
    originalFolder: aSrcFolderURI,
    originalURI: aItemURI,
    originalPos: pos
  };

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
  }

  gClippingsTree.rebuild();
  updateDisplay();

  if (aSelectMovedItem) {
    gClippingsTree.ensureURIIsVisible(newURI);
    gClippingsTree.selectedURI = newURI;
    gClippingsTree.click();
  }
  else {
    var numRows = gClippingsTree.getRowCount();
    if (prevIndex == numRows) {  // Moved item was last list item.
      gClippingsTree.selectedIndex = numRows - 1;
      gClippingsTree.ensureIndexIsVisible(numRows - 1);
    }
    else {
      gClippingsTree.selectedIndex = prevIndex;
      gClippingsTree.ensureIndexIsVisible(prevIndex);
    }
  }

  gIsClippingsDirty = true;
  commit();

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}



function updateEditStatus() 
{
  gStatusBar.label = gStrBundle.getString("editEntry");
}


function commit()
{
  // This function is necessary to prevent undesirable undoing of editing
  // actions when reloading (bug 17669)

  if (!gIsClippingsDirty || gSaveInProgress) {
    if (gSaveInProgress) {
      aeUtils.beep();
      aeUtils.log("commit() aborted because another commit/save is in progress");
    }
    return;
  }

  var maxAttempts = aeUtils.getPref("clippings.clipmgr.max_commit_attempts", 5);
  var numAttempts = 0;

  while (gIsClippingsDirty && numAttempts < maxAttempts) {
    numAttempts++;

    try {
      gSaveInProgress = true;
      gClippingsSvc.flushDataSrc(false, false);
      gIsClippingsDirty = false;
    }
    catch (e) {	
      if (aeUtils.DEBUG) {
	aeUtils.beep();
      }
      var tryAgain = numAttempts < maxAttempts ? "(will try again)" : "";
      aeUtils.log(aeString.format("function commit(): Save attempt #%s failed %s\nException thrown by aeIClippingsService.flushDataSrc():\n\n%s", numAttempts, tryAgain, e));
	
    }
    finally {
      gSaveInProgress = false;
    }
  }

  if (gIsClippingsDirty) {
    aeUtils.log("function commit(): All attempts to commit have failed, giving up\ngIsClippingsDirty = " + gIsClippingsDirty);
  }
}


function saveClippings(aSuppressStatusMsgs, aForceSave, aDoBackup)
{
  updateCurrentClippingData();

  if (gSaveInProgress || (!gIsClippingsDirty && !aForceSave)) {
    if (gSaveInProgress) {
      aeUtils.beep();
      aeUtils.log("saveClippings() aborted because another commit/save is in progress");
    }
    return;
  }

  if (! aSuppressStatusMsgs) {
    gStatusBar.label = gStrBundle.getString("saveProgress");
  }

  let msg = gStrBundle.getString("saveCompleted");
  let saveJSON = this.aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
  try {
    gSaveInProgress = true;
    gClippingsSvc.flushDataSrc(aDoBackup, saveJSON);
    gIsClippingsDirty = false;

    if (aSuppressStatusMsgs) {
      return;
    }
  }
  catch (e) {
    msg = gStrBundle.getString("errorSaveFailed");
  }
  finally {
    gSaveInProgress = false;
  }

  gStatusBar.label = msg;
}


function reload()
{
  // WARNING:
  // Do not open any windows or dialog boxes from within this function;
  // otherwise Clipping Manager's reload event handler will be invoked again
  // when the window or dialog box is closed!
 
  if (gJustMigrated) {
    // Not necessary to reload if Migration Wizard has just completed.
    // Also, clear the `dirty' flag because it was ignored when datasource was
    // not migrated from user profile directory, and leaving it set would cause
    // the error message below to appear unnecessarily.
    gJustMigrated = false;
    gIsClippingsDirty = false;
    return;
  }

  if (gJustImported) {
    // Same idea as the gJustMigrated flag.
    return;
  }

  if (gSaveInProgress) {
    updateDisplay();
    return;
  }

  if (gIsClippingsDirty) {
    aeUtils.beep();
    aeUtils.log("function reload(): Previous commit failed; changes may be overwritten by changes from other host app\ngIsClippingsDirty = " + gIsClippingsDirty + "\nResetting gIsClippingsDirty flag");
    gIsClippingsDirty = false;
  }

  if (! gClippingsTree) {
    // Handle case where reload() invoked when Clippings Manager was just
    // opened.
    return;
  }
  
  // currIndex == -1 if nothing was selected
  var currIndex = gClippingsTree.selectedIndex;
  currIndex = currIndex == -1 ? 0 : currIndex;

  try {
    gClippingsSvc.refreshDataSrc();
  }
  catch (e) {
    aeUtils.beep();
    aeUtils.log("function reload(): Reload failed!\n\n" + e);
    gStatusBar.label = "Reload Failed!";
    return;
  }

  gClippingsTree.rebuild();
  updateItemCount();

  // Selection on tree list disappears after rebuild.  Restore it.
  var numRows = gClippingsTree.getRowCount();
  if (numRows == 0) {
    $("entry-properties").selectedIndex = 1;
    gCurrentListItemIndex = -1;
  }
  else if (currIndex == numRows) {  // Deleted item was last list item
    gClippingsTree.selectedIndex = numRows - 1;
    gClippingsTree.ensureIndexIsVisible(numRows - 1);
    updateDisplay();
  }
  else {
    gClippingsTree.selectedIndex = currIndex;
    gClippingsTree.ensureIndexIsVisible(currIndex);
    updateDisplay();
  }
}


function insertClipping()
{
  if (gClippingsTree.getRowCount() == 0) {
    return;
  }

  updateCurrentClippingData();

  var uri = gClippingsTree.selectedURI;
  if (! uri) {
    return;
  }

  if (gClippingsSvc.isClipping(uri)) {
    var haWnd = aeUtils.getRecentHostAppWindow();

    if (! haWnd) {
      return;
    }

    var name = gClippingsSvc.getName(uri);
    var text = gClippingsSvc.getText(uri);

    if ("aecreations" in haWnd && "clippings" in haWnd.aecreations) {
      haWnd.aecreations.clippings.insertClippingText(uri, name, text);
    }
  }
}


function deleteClippingOrFolder(aDelKeyPressed) 
{
  if (aDelKeyPressed) {
    var delKeyEnabled = aeUtils.getPref("clippings.clipmgr.enable_delete_key", true);
    if (! delKeyEnabled) {
      return;
    }
  }

  if (gClippingsTree.getRowCount() == 0) {
    aeUtils.beep();
    gStatusBar.label = gStrBundle.getString("msgNothingToDelete");
    return;
  }

  updateCurrentClippingData();

  var uri = gClippingsTree.selectedURI;
  if (! uri) {
    return;
  }

  if (gClippingsSvc.isEmptyClipping(uri)) {
    aeUtils.beep();
    return;
  }

  let isSyncClippings = aeUtils.getPref("clippings.datasource.wx_sync.enabled", false);
  if (uri == gClippingsSvc.kSyncFolderURI && isSyncClippings) {
    doAlert(gStrBundle.getString("deleteSyncFldr"));
    return;
  }

  deleteClpOrFldrHelper(uri, UNDO_STACK);

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}


function deleteClpOrFldrHelper(aURI, aDestUndoStack)
{
  var deletedItemIndex = gClippingsTree.selectedIndex;
  var state;
  var pos = gClippingsSvc.indexOf(aURI);

  if (gClippingsSvc.isClipping(aURI)) {
    state = {
      action: ACTION_DELETECLIPPING,
      uri:    aURI, 
      name:   gClippingsSvc.getName(aURI),
      text:   gClippingsSvc.getText(aURI),
      label:  gClippingsSvc.getLabel(aURI),
      srcURL: gClippingsSvc.getSourceURL(aURI),
      key:    gClippingsSvc.getShortcutKey(aURI),
      pos:    pos,
      parentFolderURI: gClippingsSvc.getParent(aURI)
    };

    try {
      gClippingsSvc.remove(aURI);
    }
    catch (e) {
      doAlert(gStrBundle.getString("errorCannotDelete"));
      return;
    }
  }
  else if (gClippingsSvc.isFolder(aURI)) {
    if (gClippingsSvc.getCount(aURI) > 0) {
      aeUtils.log("Removing non-empty folder");
      state = {
	action: ACTION_DELETEFOLDER,
	name:   gClippingsSvc.getName(aURI),
	parentFolderURI: gClippingsSvc.getParent(aURI)
      };

      try {
	gClippingsSvc.detachFromFolder(aURI);
      }
      catch (e) {
	doAlert(gStrBundle.getString("errorCannotDelete"));
	return;
      }
    }
    else {
      aeUtils.log("Removing empty folder");
      state = {
	action: ACTION_DELETEEMPTYFOLDER,
	name:   gClippingsSvc.getName(aURI),
	parentFolderURI: gClippingsSvc.getParent(aURI)
      };

      try {
	gClippingsSvc.remove(aURI);
      }
      catch (e) {
	doAlert(gStrBundle.getString("errorCannotDelete"));
	return;
      }
    }

    state.uri = aURI;
    state.pos = pos;
  }

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
    aeUtils.log(aeString.format("Deleted entry %S (URI %s added to undo stack)\nPosition: %d", state.name, state.uri, state.pos));
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
    aeUtils.log(aeString.format("Deleted entry %S (URI %s added to redo stack)", state.name, uri));
  }

  gIsClippingsDirty = true;
  gClippingsTree.removeNode(aURI);

  updateItemCount();

  var numRows = gClippingsTree.getRowCount();
  if (numRows == 0) {
    $("entry-properties").selectedIndex = 1;
    gCurrentListItemIndex = -1;
  }
  else if (deletedItemIndex == numRows) {  // Deleted item was last list item
    gClippingsTree.selectedIndex = numRows - 1;
    gClippingsTree.ensureIndexIsVisible(numRows - 1);
    updateDisplay();
  }
  else {
    gClippingsTree.selectedIndex = deletedItemIndex;
    gClippingsTree.ensureIndexIsVisible(deletedItemIndex);
    updateDisplay();
  }

  commit();
}


function isClippingTextAreaFocused()
{
  var focusedElt = document.commandDispatcher.focusedElement;

  // <textbox multiline="true"> is actually an <html:textarea> element.
  // Full XBL hierarchy: <textbox> -> <xul:hbox> -> <html:textarea>
  return (focusedElt.nodeName == "html:textarea" && focusedElt.parentElement.parentElement.id == "clipping-text");
}


function updateToolsMenu()
{
  let cmdShowHidePlaceholderBar = $("cmd_togglePlaceholderBar");
  let cmdShowHideDetailsPane = $("cmd_toggleDetailsPane");
  let uri = gClippingsTree.selectedURI;

  if (!uri || gClippingsSvc.isFolder(uri) || gClippingsSvc.isEmptyClipping(uri)) {
    cmdShowHidePlaceholderBar.setAttribute("disabled", "true");
    cmdShowHideDetailsPane.setAttribute("disabled", "true");
  }
  else {
    cmdShowHidePlaceholderBar.removeAttribute("disabled");
    cmdShowHideDetailsPane.removeAttribute("disabled");
  }

  cmdShowHidePlaceholderBar.setAttribute("checked", gPlaceholderBar.isActivated());
  cmdShowHideDetailsPane.setAttribute("checked", gClippingDetailsPaneVisible);
}


function togglePlaceholderBar()
{
  if (gPlaceholderBar.isVisible()) {
    gPlaceholderBar.hide();
  }
  else {
    gPlaceholderBar.show();
  }

  aeUtils.setPref("clippings.clipmgr.placeholder_toolbar", gPlaceholderBar.isVisible());
}


function toggleClippingDetails()
{
  gClippingDetailsPaneVisible = !gClippingDetailsPaneVisible;

  if (gClippingDetailsPaneVisible) {
    gOptionsBar.show();
  }
  else {
    gOptionsBar.hide();
  }

  aeUtils.setPref("clippings.clipmgr.details_pane", gClippingDetailsPaneVisible);
}


function insertCustomPlaceholder()
{
  if (! isClippingTextAreaFocused()) {
    aeUtils.beep();
    return;
  }

  var dlgArgs = {
    CUSTOM: 0,
    AUTO_INCREMENT: 1,
    placeholder: ""
  };

  dlgArgs.placeholderType = dlgArgs.CUSTOM;
  dlgArgs.userCancel = null;

  window.openDialog("chrome://clippings/content/insertPlaceholder.xul", "clippings_ins_plchldr", "modal,centerscreen", dlgArgs);

  if (dlgArgs.userCancel) {
    return;
  }

  insertIntoClippingText(dlgArgs.placeholder);
}


function insertAutoIncrementPlaceholder()
{
  if (! isClippingTextAreaFocused()) {
    aeUtils.beep();
    return;
  }

  var dlgArgs = {
    CUSTOM: 0,
    AUTO_INCREMENT: 1,
    placeholder: ""
  };

  dlgArgs.placeholderType = dlgArgs.AUTO_INCREMENT;
  dlgArgs.userCancel = null;

  window.openDialog("chrome://clippings/content/insertPlaceholder.xul", "clippings_ins_plchldr", "modal,centerscreen", dlgArgs);

  if (dlgArgs.userCancel) {
    return;
  }

  insertIntoClippingText(dlgArgs.placeholder);
}


function insertPresetPlaceholder(aPresetName)
{
  if (! isClippingTextAreaFocused()) {
    aeUtils.beep();
    return;
  }

  var placeholder = "";

  switch (aPresetName) {
  case "NAME":
    placeholder = "$[NAME]";
    break;

  case "FOLDER":
    placeholder = "$[FOLDER]";
    break;
    
  case "DATE":
    placeholder = "$[DATE]";
    break;

  case "TIME":
    placeholder = "$[TIME]";
    break;

  case "HOSTAPP":
    placeholder = "$[HOSTAPP]";
    break;

  case "UA":
    placeholder = "$[UA]";
    break;

  default:
    break;
  }

  insertIntoClippingText(placeholder);
}


function insertIntoClippingText(aInsertedText)
{
  var focusedElt = document.commandDispatcher.focusedElement;

  // <textbox multiline="true"> is actually an <html:textarea> element.
  // Full XBL hierarchy: <textbox> -> <xul:hbox> -> <html:textarea>
  if (focusedElt.nodeName == "html:textarea" && focusedElt.parentElement.parentElement.id == "clipping-text") {
    let textbox = focusedElt;

    aeInsertTextIntoTextbox(textbox, aInsertedText);
  }
  else {
    aeUtils.beep();
    aeUtils.log("The clipping content textarea is not focused!");
  }
}


function updateCurrentEntryStatus()
{
  if (gClippingsTree.getRowCount() == 0) {
    return;
  }

  updateItemCount();

  var deck = $("entry-properties");
  if (deck.selectedIndex != 0) {
    deck.selectedIndex = 0;
  }
}


function updateDisplay(aSuppressUpdateSelection)
{
  if (gClippingsTree.getRowCount() == 0) {
    return;
  }

  var clippingName = $("clipping-name");
  var clippingText = $("clipping-text");
  var clippingKey = $("clipping-key");
  var clippingKeyLabel = $("clipping-key-label");
  var shortcutKeyMiniHelp = $("shortcut-key-minihelp");
  var labelPickerLabel = $("clipping-label");
  var labelPickerBtn;

  if (gAltClippingLabelPicker) {
    labelPickerBtn = $("clipping-label-btn-2");
  }
  else {
    labelPickerBtn = $("clipping-label-btn");
  }

  var uri = gClippingsTree.selectedURI;

  if (! uri) {
    // Nothing selected - so just select whatever is at the current index.
    var numRows = gClippingsTree.getRowCount();
    if (gCurrentListItemIndex == -1 || gCurrentListItemIndex > (numRows - 1)) {
      gCurrentListItemIndex = numRows - 1;
    }

    gClippingsTree.selectedIndex = gCurrentListItemIndex;
    uri = gClippingsTree.selectedURI;
  }

  if (gClippingsSvc.isFolder(uri)) {
    clippingName.disabled = (uri == gClippingsSvc.kSyncFolderURI);
    clippingText.style.visibility = "hidden";
    shortcutKeyMiniHelp.style.visibility = "hidden";
      
    clippingKey.selectedIndex = 0;
    clippingKeyLabel.style.visibility = "hidden";
    clippingKey.style.visibility = "hidden";

    labelPickerLabel.style.visibility = "hidden";
    labelPickerBtn.style.visibility = "hidden";

    if (gPlaceholderBar.isVisible()) {
      gPlaceholderBar.hide();
      updateDisplay.placeholderBarVisible = true;
    }
  }
  // Special handling of the dummy item in an empty folder
  else if (gClippingsSvc.isEmptyClipping(uri)) {
    clippingName.disabled = true;
    clippingText.style.visibility = "hidden";
    shortcutKeyMiniHelp.style.visibility = "hidden";

    clippingKey.selectedIndex = 0;
    clippingKeyLabel.style.visibility = "hidden";
    clippingKey.style.visibility = "hidden";

    labelPickerLabel.style.visibility = "hidden";
    labelPickerBtn.style.visibility = "hidden";

    if (gPlaceholderBar.isVisible()) {
      gPlaceholderBar.hide();
      updateDisplay.placeholderBarVisible = true;
    }
  }
  else {
    clippingName.disabled = false;
    clippingText.style.visibility = "visible";
    clippingKeyLabel.style.visibility = "visible";
    clippingKey.style.visibility = "visible";
    shortcutKeyMiniHelp.style.visibility = "visible";
    labelPickerLabel.style.visibility = "visible";
    labelPickerBtn.style.visibility = "visible";

    if (updateDisplay.placeholderBarVisible) {
      gPlaceholderBar.show();
      updateDisplay.placeholderBarVisible = null;
    }
  }

  clippingName.value = gClippingsSvc.getName(uri);
  let debugStr = "";
  
  if (gClippingsSvc.isClipping(uri)) {
    clippingText.value = gClippingsSvc.getText(uri);

    if (gClippingsSvc.hasLabel(uri)) {
      let label = gClippingsSvc.getLabel(uri);
      debugStr += aeString.format("Label: %s", (label || "(none)"));
      updateLabelMenu();
      labelPickerBtn.image = aeString.format("chrome://clippings/skin/images/%s", gClippingLabelPicker.getIconFileStr(label));
    }
    else {
      debugStr += "\nNo label.";
      labelPickerBtn.image = "chrome://clippings/skin/images/label-none.png";
    }
    aeUtils.log(debugStr);
  }

  var key;
  if (gClippingsSvc.isClipping(uri) && (key = gClippingsSvc.getShortcutKey(uri))) {
    for (let i = 0; i < clippingKey.menupopup.childNodes.length; i++) {
      if (clippingKey.menupopup.childNodes[i].label == key) {
	clippingKey.selectedIndex = i;
	break;
      }
    }
  }
  else {
    clippingKey.selectedIndex = 0;
  }

  gCurrentListItemIndex = gClippingsTree.selectedIndex;

  if (! aSuppressUpdateSelection) {
    gClippingsTree.ensureIndexIsVisible(gClippingsTree.selectedIndex);
  }
}

updateDisplay.placeholderBarVisible = null;


function updateLabelMenu()
{
  let uri = gClippingsTree.selectedURI;

  if (!uri || !gClippingsSvc.isClipping(uri)) {
    aeUtils.log("Unable to update the label picker because a selected clipping could not be located");
    return;
  }

  let label = gClippingsSvc.getLabel(uri);

  gClippingLabelPicker.selectedLabel = label;  
  gClippingLabelPickerCxtMenu.selectedLabel = label;

  if (gAltClippingLabelPicker) {
    updateAltLabelMenu(label);
  }
}


function updateAltLabelMenu(aLabel)
{
  let labelClass = "clipping-label-" + (aLabel ? aLabel : "none");

  aeUtils.log(aeString.format("updateAltLabelMenu(): Updating radio menuitem selection for alternative color label picker; label class: %S", labelClass));

  let menuitems = $("clipping-label-menupopup-2").childNodes;
  for (let i = 0; i < menuitems.length; i++) {
    menuitems[i].removeAttribute("checked");
  }

  let menuitemsCxt = $("clipping-label-cxt-menupopup-2").childNodes;
  for (let i = 0; i < menuitemsCxt.length; i++) {
    menuitemsCxt[i].removeAttribute("checked");
  }

  $("clipping-label-menupopup-2").getElementsByClassName(labelClass)[0].setAttribute("checked", "true");
  $("clipping-label-cxt-menupopup-2").getElementsByClassName(labelClass)[0].setAttribute("checked", "true");
}


function updateLabel(aLabelID)
{
  if (gCurrentListItemIndex == -1) {
    return;
  }

  var uri = gClippingsTree.getURIAtIndex(gCurrentListItemIndex);

  if (!uri || !gClippingsSvc.isClipping(uri)) {
    aeUtils.log("updateLabel(): Can't update a label on a non-clipping!");
    return;
  }

  updateLabelHelper(uri, aLabelID, UNDO_STACK);
}


function updateLabelHelper(aClippingURI, aLabelID, aDestUndoStack)
{
  var label = aLabelID.substring(aLabelID.lastIndexOf("-") + 1);
  if (label == "none") {
    label = gClippingsSvc.LABEL_NONE;
  }

  var oldLabel = gClippingsSvc.getLabel(aClippingURI);
  gClippingsSvc.setLabel(aClippingURI, label);

  gClippingLabelPicker.selectedLabel = label;
  gClippingLabelPickerCxtMenu.selectedLabel = label;
  if (gAltClippingLabelPicker) {
    updateAltLabelMenu(label);
  }

  gClippingsTree.setNodeProperty(aClippingURI, label);
  
  var state = { 
    action: ACTION_SETLABEL, 
    uri:    aClippingURI, 
    label:  oldLabel
  };

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
    aeUtils.log(aeString.format("In function updateLabelHelper(): Clipping label %s added to undo stack", label));
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
    aeUtils.log(aeString.format("In function updateLabelHelper(): Clipping label %s added to redo stack", label));
  }

  gIsClippingsDirty = true;
  commit();
}


function updateName(aName)
{
  if (gCurrentListItemIndex == -1) {
    return;
  }

  var uri = gClippingsTree.getURIAtIndex(gCurrentListItemIndex);
  updateNameHelper(uri, aName, UNDO_STACK);

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }

  gClippingsTree.setNodeTitle(uri, aName);
}


function updateNameHelper(aURI, aName, aDestUndoStack)
{
  var oldName = gClippingsSvc.getName(aURI);
  if (oldName == aName) {
    return;
  }

  var state = {action: ACTION_EDITNAME, uri: aURI, name: oldName, text: null};
  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
    aeUtils.log(aeString.format("In function updateNameHelper(): Old Entry name: %S\nOld entry name added to undo stack", oldName));
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
    aeUtils.log(aeString.format("In function updateNameHelper(): Old Entry name: %S\nOld entry name added to redo stack", oldName));
  }

  gClippingsSvc.setName(aURI, aName);
  gIsClippingsDirty = true;
  commit();
}


function updateText(aText)
{
  if (gCurrentListItemIndex == -1) {
    return;
  }
  var uri = gClippingsTree.getURIAtIndex(gCurrentListItemIndex);
  if (gClippingsSvc.isFolder(uri) || gClippingsSvc.isEmptyClipping(uri)) {
    // Folders don't have a `text' predicate, so just ignore
    return;
  }

  updateTextHelper(uri, aText, UNDO_STACK);
}


function updateTextHelper(aURI, aText, aDestUndoStack)
{
  var oldText = gClippingsSvc.getText(aURI);
  if (oldText == aText) {
    return;
  }

  // DEBUGGING
  var name = gClippingsSvc.getName(aURI);
  // END DEBUGGING

  var state = {action: ACTION_EDITTEXT, uri: aURI, name: name, text: oldText};
  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push({action:ACTION_EDITTEXT, uri:aURI, name:name, text:oldText});
    // We shouldn't care what the old name is.
    // Non-debug invocation to push() should be as follows:
    /***
	gUndoStack.push(ACTION_EDITTEXT, aURI, null, oldText);
    ***/
    aeUtils.log(aeString.format("In function updateTextHelper(): Entry name: %S\nOld text before edit added to undo stack\noldText = %S", name, oldText));
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
    aeUtils.log(aeString.format("In function updateTextHelper(): Added to redo stack: oldText == %S", oldText));
  }

  gClippingsSvc.setText(aURI, aText);
  gIsClippingsDirty = true;
  commit();
}


function updateCurrentClippingData()
{
  // Quick edit mode may still be active if the "Description" and "Text"
  // textboxes are still focused during search.
  if (gQuickEdit.isStarted()) {
    gQuickEdit.stop();
  }

  if (gClippingsSvc.numItems > 0) {
    updateName($("clipping-name").value);

    var uri = gClippingsTree.getURIAtIndex(gCurrentListItemIndex);
    if (gClippingsSvc.isClipping(uri)) {
      updateText($("clipping-text").value);
    }
  }
}


function moveUp()
{
  var currentURI = gClippingsTree.selectedURI;
  var p = gClippingsSvc.getParent(currentURI);
  var i = gClippingsSvc.indexOf(currentURI);
  var max = gClippingsSvc.getCount(p);

  if (1 < i && i <= max) {
    moveEntry(currentURI, p, i, i - 1, UNDO_STACK);
    gClippingsTree.selectedURI = currentURI;
    updateDisplay();
  }
  else if (i == 1) {
    aeUtils.beep();
    gStatusBar.label = "Already at first item of folder";
  }
}


function moveDown()
{
  var currentURI = gClippingsTree.selectedURI;
  var p = gClippingsSvc.getParent(currentURI);
  var i = gClippingsSvc.indexOf(currentURI);
  var max = gClippingsSvc.getCount(p);

  if (1 <= i && i < max) {
    moveEntry(currentURI, p, i, i + 1, UNDO_STACK);
    gClippingsTree.selectedURI = currentURI;
    updateDisplay();
  }
  else if (i == max) {
    aeUtils.beep();
    gStatusBar.label = "Already at last item of folder";
  }
}


function moveEntry(aURI, aParentFolderURI, aOldPos, aNewPos, aDestUndoStack)
  // aOldPos and aNewPos are 1-based (NOT zero-based) indices
{
  var state = {action: ACTION_CHANGEPOSITION, uri: aURI,
	       currPos: aNewPos, prevPos: aOldPos,
	       parentFolderURI: aParentFolderURI};

  if (aDestUndoStack == UNDO_STACK) {
    gUndoStack.push(state);
  }
  else if (aDestUndoStack == REDO_STACK) {
    gRedoStack.push(state);
  }

  aeUtils.log(aeString.format("In function moveEntry(): aOldPos=%d; aNewPos=%d", aOldPos, aNewPos));

  gClippingsSvc.changePosition(aParentFolderURI, aOldPos, aNewPos);
  gIsClippingsDirty = true;
  commit();
}


function doExport()
{
  window.openDialog("chrome://clippings/content/export.xul", "export_dlg", "dialog,modal,centerscreen");
}


function doImport()
{
  let dlgArgs = {
    numImported: null,
    replaceShortcutKeys: true,
    userCancel: null
  };

  // Suppress reloading of clippings tree when Clippings Manager window
  // receives focus after the Import Clippings dialog closes.
  gJustImported = true;
  
  let impDlg = window.openDialog("chrome://clippings/content/import.xul", "import_dlg", "dialog,modal,centerscreen", dlgArgs);

  if (dlgArgs.userCancel) {
    gJustImported = false;
    return;
  }

  // Handle empty RDF files
  if (dlgArgs.numImported == 0) {
    let toolsMenu = $("clippings-options");
    let panel = $("import-empty-alert");
    $("import-empty-alert-msg").value = gStrBundle.getString("msgNoItems");
    gStatusBar.label = "";
    aeUtils.beep();
    panel.openPopup(toolsMenu, "after_start", 0, 0, false, false);
    gJustImported = false;
    return;
  }

  gClippingsTree.rebuild();
  
  var deck = $("entry-properties");
  if (gClippingsTree.getRowCount() > 0) {
    deck.selectedIndex = 0;
    gClippingsTree.selectedIndex = 0;
    gClippingsTree.click();
  }

  // Status bar msg is overwritten in listbox.click() call, so redisplay
  // status of import.
  gStatusBar.label = aeString.format("%s%s",
                                     gStrBundle.getString("importBegin"),
                                     gStrBundle.getString("importDone"));
  try {
    gClippingsSvc.flushDataSrc(true, false);
  }
  catch (e) {
    // Don't do anything for now - try again when closing Clippings Manager.
  }

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }

  gJustImported = false;
}

// Return values of doImport()
doImport.USER_CANCEL             = 0;
doImport.SUCCESS                 = 1;
doImport.ERROR_FILE_IO           = 2;
doImport.ERROR_UNINITIALIZED_DS  = 3;
doImport.ERROR_FILE_UNREADABLE   = 4;
doImport.ERROR_CANNOT_IMPORT_DS  = 5;
doImport.ERROR_UNEXPECTED        = 15;



function initRestorePopup(aEvent)
{
  if (aEvent.target.id != "restore-popup") {
    return;
  }

  let restoreMenuPopup = aEvent.target;
  let chooseBackupMenuItem = $("choose-backup-file");

  // Refresh the menu by deleting all entries except the "Choose File" command.
  let rmTarget = restoreMenuPopup.firstChild;
  while (rmTarget.id != "choose-backup-file") {
    restoreMenuPopup.removeChild(rmTarget);
    rmTarget = restoreMenuPopup.firstChild;
  }

  let backupFileNamesMap = gClippingsSvc.getBackupFileNamesMap();
  let backupFileNames = [];

  backupFileNamesMap.forEach((aValue, aKey, aMap) => {
    backupFileNames.push(aValue);
  });
  
  backupFileNames = backupFileNames.sort();

  for (let i = 0; i < backupFileNames.length; i++) {
    let menuItem = document.createElement("menuitem");
    let valueStr = backupFileNamesMap.get(backupFileNames[i]);
    menuItem.setAttribute("label", valueStr);
    menuItem.setAttribute("value", backupFileNames[i]);
    menuItem.addEventListener("command", function (evt) { restoreBackupFile(evt.target.value); }, false);
    restoreMenuPopup.insertBefore(menuItem, chooseBackupMenuItem);
  }

  if (backupFileNames.length > 0) {
    let separator = document.createElement("menuseparator");
    restoreMenuPopup.insertBefore(separator, chooseBackupMenuItem);
  }
}


function backupClippings()
{
  var fp = Components.classes["@mozilla.org/filepicker;1"]
                     .createInstance(Components.interfaces.nsIFilePicker);
  fp.init(window, gStrBundle.getString("dlgTitleBackup"), fp.modeSave);
  fp.defaultString = gStrBundle.getString("clippingsBkupFilename");
  fp.defaultExtension = "rdf";
  fp.appendFilter(gStrBundle.getString("rdfImportFilterDesc"), "*.rdf");

  var fpShownCallback = {
    done: function (aResult) {
      if (aResult == fp.returnCancel) {
        return;
      }
 
      try {
        gClippingsSvc.exportToFile(fp.fileURL.spec, gClippingsSvc.FILETYPE_RDF_XML, true);
      }
      catch (e) {
	if (e.result === undefined) {
	  doAlert(gStrBundle.getString("errorBackupFailed"));
	  return;
	}
	
	if (e.result == Components.results.NS_ERROR_NOT_INITIALIZED) {
	  doAlert(gStrBundle.getString("alertExportFailedNoDS"));
	}
	else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
	  doAlert(gStrBundle.getString("errorOutOfMemory"));
	}
	else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
	  doAlert(gStrBundle.getString("errorAccessDenied"));
	}
	else if (e.result == Components.results.NS_ERROR_FILE_READ_ONLY) {
	  doAlert(gStrBundle.getString("errorFileReadOnly"));
	}
	else if (e.result == Components.results.NS_ERROR_FILE_DISK_FULL) {
	  doAlert(gStrBundle.getString("errorDiskFull"));
	}
	else {
          doAlert(gStrBundle.getString("errorBackupFailed"));
	}
      }
    }
  };

  fp.open(fpShownCallback);
}


function restoreUserSelectedBackupFile()
{
  var fp = Components.classes["@mozilla.org/filepicker;1"]
                     .createInstance(Components.interfaces.nsIFilePicker);
  fp.init(window, gStrBundle.getString("dlgTitleRestore"), fp.modeOpen);
  fp.appendFilter(gStrBundle.getString("rdfImportFilterDesc"), "*.rdf");

  var fpShownCallback = {
    done: function (aResult) {
      if (aResult == fp.returnCancel) {
        return;
      }

      var url = fp.fileURL.spec;
      var dsURL = aeUtils.getDataSourcePathURL() + aeConstants.CLIPDAT_FILE_NAME;

      // Prevent attempt at importing data source file.
      if (url == dsURL) {
        doAlert(aeString.format("%s %S", gStrBundle.getString("errorCannotImportDSFile"), url));
        return;
      }

      var doRestore = aeUtils.confirmYesNo(gStrBundle.getString("appName"), gStrBundle.getString("confirmRestore"), true);
      if (! doRestore) {
        return;
      }

      restoreBackup(url);
    }
  };

  fp.open(fpShownCallback);
}


function restoreBackupFile(aBackupFileName)
{
  var doRestore = aeUtils.confirmYesNo(gStrBundle.getString("appName"), gStrBundle.getString("confirmRestore"), true);

  if (doRestore) {
    var url = aeUtils.getDataSourcePathURL() + aeConstants.BACKUP_DIR_NAME + "/" + aBackupFileName;
    restoreBackup(url);
  }
}


function restoreBackup(aBackupFileURL)
{
  aeUtils.log("Removing all existing clippings and folders");
  
  gClippingsSvc.removeAll();
  
  // Must flush changes, or else the original clippings data will persist.
  try {
    gClippingsSvc.flushDataSrc(false, false);
  }
  catch (e) {}

  aeUtils.log("Restoring backup file: " + aBackupFileURL);

  // Import the data from the backup file into the regenerated datasource.
  try {
    var importDSRootCtr = {};
    var numImported = gClippingsSvc.importFromFile(aBackupFileURL, false, true, importDSRootCtr);
  }
  catch (e) {
    if (e.result === undefined) {
      aeUtils.log(e);
      var err = gStrBundle.getFormattedString("alertImportFailed", [aBackupFileURL]);
      doAlert(err);
      return;
    }
    
    if (e.result == Components.results.NS_ERROR_NOT_INITIALIZED) {
      doAlert(gStrBundle.getString('alertImportFailedNoDS'));
      return;
    }
    else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
      doAlert(gStrBundle.getString("errorOutOfMemory"));
      return;
    }
    else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
      doAlert(aeString.format("%s: %S", gStrBundle.getString("errorAccessDenied"),
			      aBackupFileURL));
      return;
    }
    else if (e.result == Components.results.NS_ERROR_FILE_IS_LOCKED) {
      doAlert(aeString.format("%s: %S", gStrBundle.getString("errorFileLocked"),
			  aBackupFileURL));
      return;
    }
    else {
      aeUtils.log(e);
      var err = gStrBundle.getFormattedString("alertImportFailed", [aBackupFileURL]);
      doAlert(err);
      return;
    }
  }

  importDSRootCtr = importDSRootCtr.value;

  // Append the "empty" clipping to any empty folders that were imported
  gClippingsSvc.processEmptyFolders();

  try {
    gClippingsSvc.flushDataSrc(true, false);
  }
  catch (e) {}

  aeUtils.log("Datasource restore completed!");

  // Finally, rebuild the clippings tree and select the first clipping.
  gClippingsTree.rebuild();

  if (numImported > 0) {
    gClippingsTree.selectedIndex = 0;
  }
  updateDisplay();

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}


function initClippingsListPopup()
{
  var numListItems = gClippingsTree.getRowCount();
  if (numListItems == 0) {
    return false;  // Don't show popup menu if list box is empty
  }

  var clippingsListCxt = $("clippings-list-context");
  var uri = gClippingsTree.selectedURI;
  
  let isSyncFldr = uri == gClippingsSvc.kSyncFolderURI;
  $("cmd_cut").setAttribute("disabled", isSyncFldr);
  $("cmd_copy").setAttribute("disabled", isSyncFldr);
  $("move-or-copy-cxt").setAttribute("disabled", isSyncFldr);
  $("delete-cxt").setAttribute("disabled", isSyncFldr);

  var clippingLabelCxtMenu;
  if (gAltClippingLabelPicker) {
    clippingLabelCxtMenu = $("clipping-label-cxt-2");
  }
  else {
    clippingLabelCxtMenu = $("clipping-label-cxt");
  }

  clippingLabelCxtMenu.hidden = !gClippingsSvc.isClipping(uri);
  $("clipping-label-cxt-separator").hidden = !gClippingsSvc.isClipping(uri);

  return true;
}


function initMoveMenuPopup()
{
  var moveToMnu2 = $("move-to-2");
  var copyToMnu2 = $("copy-to-2");
  var uri = gClippingsTree.selectedURI;
  var boolFlag  = gClippingsSvc.numItems == 0 || gClippingsSvc.isEmptyClipping(uri);

  moveToMnu2.setAttribute("disabled", boolFlag);
  copyToMnu2.setAttribute("disabled", boolFlag);

  return true;
}


function undo()
{
  updateCurrentClippingData();

  if (gUndoStack.length == 0) {
    aeUtils.beep();
    gStatusBar.label = gStrBundle.getString("msgNothingToUndo");
    return;
  }

  updateItemCount();

  var undo = gUndoStack.pop();
  var srcFolder;  // Used for undoing move or copy
  var pos;        // Used for undoing folder or clipping creation

  if (! gClippingsSvc.exists(undo.uri) && undo.action != ACTION_DELETECLIPPING
      && undo.action != ACTION_DELETEFOLDER && undo.action != ACTION_COPYTOFOLDER) {
    aeUtils.beep();
    gStatusBar.label = gStrBundle.getString("cantUndo");
    return;
  }

  if (undo.action == ACTION_DELETECLIPPING) {
    gClippingsSvc.createNewClippingEx(undo.parentFolderURI, undo.uri,
				      undo.name, undo.text, undo.srcURL,
                                      undo.label, undo.pos, true);

    if (undo.key) {
      try {
	gClippingsSvc.setShortcutKey(undo.uri, undo.key);
      }
      catch (e) {
	// Shortcut key already assigned to a clipping - theoretically, this is
	// an unreachable case because the shortcut key assignment would have
	// been undone before undoing deletion.
	aeUtils.beep();
	aeUtils.log(aeString.format("Cannot restore shortcut key: the key %S is assigned to another clipping", undo.key));
      }
    }

    gIsClippingsDirty = true;
    commit();

    gClippingsTree.addLeafNode(undo.parentFolderURI, undo.uri, undo.name);
    gClippingsTree.selectedURI = undo.uri;
    gClippingsTree.ensureURIIsVisible(undo.uri);
    updateDisplay();

    aeUtils.log(aeString.format("Deletion undo\nEntry name: %S; entry URI: %S", undo.name, undo.uri));

    var state = {
      action: ACTION_DELETECLIPPING, 
      uri:    undo.uri,
      name:   undo.name, 
      text:   undo.text,
      srcURL: undo.srcURL,
      label:  undo.label,
      key:    undo.key || "",
      pos:    undo.pos
    };

    gRedoStack.push(state);
  }
  else if (undo.action == ACTION_EDITTEXT) {
    updateTextHelper(undo.uri, undo.text, REDO_STACK);
    gClippingsTree.selectedURI = undo.uri;
    updateDisplay();

    var clippingText = $("clipping-text");
    clippingText.focus();
    clippingText.select();

    aeUtils.log(aeString.format("Entry text edit undo\nEntry name: %S; entry URI: %S; oldText: %S", undo.name, undo.uri, undo.text));
  }
  else if (undo.action == ACTION_EDITNAME) {
    updateNameHelper(undo.uri, undo.name, REDO_STACK);
    gClippingsTree.selectedURI = undo.uri;
    gClippingsTree.setNodeTitle(undo.uri, undo.name);
    updateDisplay();

    var clippingName = $("clipping-name");
    clippingName.focus();
    clippingName.select();

    aeUtils.log(aeString.format("Entry name edit undo\nEntry name: %S; entry URI: %S", undo.name, undo.uri));
  }
  else if (undo.action == ACTION_CREATENEW) {
    var key = gClippingsSvc.getShortcutKey(undo.uri);
    if (key) { aeUtils.log("Shortcut key of clipping whose creation is being undone is: `" + key + "'"); }
    gClippingsTree.selectedURI = undo.uri;
    pos = undo.pos || gClippingsSvc.indexOf(undo.uri);
    deleteClpOrFldrHelper(undo.uri);
    aeUtils.log(aeString.format("Entry creation has been undone\nEntry name: %S; entry URI: %S", undo.name, undo.uri));

    gRedoStack.push({action: ACTION_CREATENEW, uri: undo.uri, 
                     name: undo.name, text: undo.text, srcURL: undo.srcURL,
                     label: undo.label, pos: pos, key: key,
                     parentFolderURI: undo.parentFolderURI});
  }
  else if (undo.action == ACTION_CREATENEWFOLDER) {
    gClippingsTree.selectedURI = undo.uri;
    pos = undo.pos || gClippingsSvc.indexOf(undo.uri);
    deleteClpOrFldrHelper(undo.uri);
    gRedoStack.push({action: ACTION_CREATENEWFOLDER, name: undo.name,
	             pos: pos, uri: undo.uri,
		     parentFolderURI: undo.parentFolderURI});
    aeUtils.log("Folder creation undone; folder name: \"" + undo.name + "\"; URI: \"" + undo.uri + "\"");
  }
  else if (undo.action == ACTION_DELETEFOLDER) {
    gClippingsSvc.reattachToFolder(undo.parentFolderURI, undo.uri, undo.pos);
    gIsClippingsDirty = true;

    gClippingsTree.addFolderNode(undo.parentFolderURI, undo.uri, undo.name);
    gClippingsTree.selectedURI = undo.uri;
    gClippingsTree.ensureURIIsVisible(undo.uri);
    gCurrentListItemIndex = gClippingsTree.selectedIndex;
    updateDisplay();

    gRedoStack.push({action: ACTION_DELETEFOLDER, uri: undo.uri});
    commit();
  }
  else if (undo.action == ACTION_DELETEEMPTYFOLDER) {
    newFolderHelper(undo.parentFolderURI, undo.name, undo.uri, undo.pos, null);
    gCurrentListItemIndex = gClippingsTree.selectedIndex;
    updateDisplay();
    
    gRedoStack.push({action: ACTION_DELETEEMPTYFOLDER, uri: undo.uri});
  }
  else if (undo.action == ACTION_MOVETOFOLDER) {
    pos = undo.originalPos;
    try {
      srcFolder = gClippingsSvc.getParent(undo.uri);
      moveToFolderHelper(undo.uri, srcFolder, undo.originalFolder,
			 undo.originalURI, pos, REDO_STACK, true);
    } catch (e) {
      throw ("Exception occurred while attempting to undo item move:\n" + e);
    }
    aeUtils.log("Move undone.");
  }
  else if (undo.action == ACTION_COPYTOFOLDER) {
    var destFolder = gClippingsSvc.getParent(undo.copyURI);
    deleteClpOrFldrHelper(undo.copyURI);
    gRedoStack.push({action:      ACTION_COPYTOFOLDER,
		     originalURI: undo.originalURI,
		     srcFolder:   undo.srcFolder,
		     destFolder:  destFolder,
		     copyURI: undo.copyURI}); 
    aeUtils.log("Copy undone.");
  }
  else if (undo.action == ACTION_CHANGEPOSITION) {
    moveEntry(undo.uri, undo.parentFolderURI, undo.currPos, undo.prevPos, REDO_STACK);
    gClippingsTree.selectedURI = undo.uri;
    updateDisplay();
  }
  else if (undo.action == ACTION_SETSHORTCUTKEY) {
    var clippingKey = $("clipping-key");
    gClippingsTree.selectedURI = undo.uri;
    updateDisplay();

    gShortcutKey.setOldKey();
    clippingKey.selectedIndex = undo.keyIdx;
    var oldKey = clippingKey.menupopup.childNodes[undo.keyIdx].label;
    gShortcutKey.update(REDO_STACK);
  }
  else if (undo.action == ACTION_SETLABEL) {
    updateLabelHelper(undo.uri, undo.label, REDO_STACK);
    gClippingsTree.selectedURI = undo.uri;
    updateDisplay();
  }

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}


function reverseLastUndo()
{
  aeUtils.log("At start of function reverseLastUndo()");

  updateCurrentClippingData();

  if (gRedoStack.length == 0) {
    aeUtils.beep();
    return;
  }

  aeUtils.log("Removing from undo queue");

  var redo = gRedoStack.pop();
  var srcFolder;  // Used for redoing move or copy
  var pos;        // Used for redoing folder or clipping creation

  if (! gClippingsSvc.exists(redo.uri) && redo.action != ACTION_CREATENEW
      && redo.action != ACTION_CREATENEWFOLDER && redo.action != ACTION_COPYTOFOLDER) {
    aeUtils.beep();
    return;
  }

  if (redo.action == ACTION_DELETECLIPPING) {
    gClippingsTree.selectedURI = redo.uri;
    deleteClpOrFldrHelper(redo.uri, UNDO_STACK);
    aeUtils.log(aeString.format("Entry deletion redone!\nEntry name: %S; entry URI: %S", redo.name, redo.uri));
  }
  else if (redo.action == ACTION_EDITNAME) {
    updateNameHelper(redo.uri, redo.name, UNDO_STACK);
    gClippingsTree.selectedURI = redo.uri;
    gClippingsTree.setNodeTitle(redo.uri, redo.name);
    updateDisplay();

    var clippingName = $("clipping-name");
    clippingName.focus();
    clippingName.select();

    aeUtils.log(aeString.format("Entry name edit redone!\nEntry name: %S; entry URI:", redo.name, redo.uri));
  }
  else if (redo.action == ACTION_EDITTEXT) {
    updateTextHelper(redo.uri, redo.text, UNDO_STACK);
    gClippingsTree.selectedURI = redo.uri;
    updateDisplay();

    var clippingText = $("clipping-text");
    clippingText.focus();
    clippingText.select();

    aeUtils.log(aeString.format("Entry text edit redone!\nEntry name: %S; entry URI: %S; oldText: %S", redo.name, redo.uri, redo.text));
  }
  else if (redo.action == ACTION_CREATENEW) {
    try {
    pos = null;  //redo.pos;
    let shortcutKey = ("key" in redo ? redo.key : "");
    let srcURL = ("srcURL" in redo ? redo.srcURL : "");
    let label = ("label" in redo ? redo.label : "");

    aeUtils.log(aeString.format("Redoing clipping creation: Name = %S", redo.name));

    newClippingHelperEx(redo.parentFolderURI, redo.name, redo.text, redo.uri, pos, shortcutKey, srcURL, label, UNDO_STACK);
    gClippingsTree.selectedURI = redo.uri;

    gIsClippingsDirty = true;
    commit();
    updateDisplay();

    } catch (e) { aeUtils.log(e) }

    aeUtils.log(aeString.format("Redoing new clipping creation!\nEntry name: %S; entry URI: %S", redo.name, redo.uri));
  }
  else if (redo.action == ACTION_CREATENEWFOLDER) {
    pos = null;  //redo.pos;
    newFolderHelper(redo.parentFolderURI, redo.name, redo.uri, pos, UNDO_STACK);
    gClippingsTree.selectedURI = redo.uri;
    aeUtils.log("Folder creation redone!  Folder name: \"" + redo.name + "\"");
  }
  else if (redo.action == ACTION_DELETEFOLDER) {
    deleteClpOrFldrHelper(redo.uri, UNDO_STACK);
  }
  else if (redo.action == ACTION_DELETEEMPTYFOLDER) {
    deleteClpOrFldrHelper(redo.uri, UNDO_STACK);
  }

  else if (redo.action == ACTION_MOVETOFOLDER) {
    try { 
      srcFolder = gClippingsSvc.getParent(redo.uri);
      moveToFolderHelper(redo.uri, srcFolder, redo.originalFolder,
			 redo.originalURI, null, UNDO_STACK, true);
    } catch (e) {
      throw ("Exception occurred while attempting to redo item move:\n" + e);
    }
    aeUtils.log("Move redone!");
  }
  else if (redo.action == ACTION_COPYTOFOLDER) {
    copyToFolderHelper(redo.originalURI, redo.srcFolder, redo.destFolder,
		       redo.copyURI, null, UNDO_STACK, true);
    aeUtils.log("Copy redone!");
  }
  else if (redo.action == ACTION_CHANGEPOSITION) {
    moveEntry(redo.uri, redo.parentFolderURI, redo.currPos, redo.prevPos, UNDO_STACK);
    gClippingsTree.selectedURI = redo.uri;
    updateDisplay();
  }
  else if (redo.action == ACTION_SETSHORTCUTKEY) {
    var clippingKey = $("clipping-key");
    gClippingsTree.selectedURI = redo.uri;
    updateDisplay();

    gShortcutKey.setOldKey();
    clippingKey.selectedIndex = redo.keyIdx;
    var oldKey = clippingKey.menupopup.childNodes[redo.keyIdx].label;
    gShortcutKey.update(UNDO_STACK);
  }
  else if (redo.action == ACTION_SETLABEL) {
    updateLabelHelper(redo.uri, redo.label, UNDO_STACK);
    gClippingsTree.selectedURI = redo.uri;
    updateDisplay();
  }
  
  gStatusBar.label = gStrBundle.getString("redoStatus");

  if (gFindBar.isActivated()) {
    gFindBar.setSearchResultsUpdateFlag();
  }
}


function toggleFindBar()
{
  var findBtn = $("find");

  if (gFindBar.isVisible()) {
    gFindBar.hide();
    gClippingsTree.focus();
    findBtn.checked = false;
  }
  else {
    gFindBar.show();
    $("find-clipping").focus();
    findBtn.checked = true;
  }
}


function userCancel()
{
  // Hide the Find Bar if it is visible.
  if (gFindBar.isVisible()) {
    gFindBar.hide();
    gClippingsTree.focus();
    $("find").checked = false;
  }
  else {
    aeUtils.beep();
  }
}


function showShortcutKeyMinihelp()
{
  let rawKeyMap = gClippingsSvc.getShortcutKeyMap();
  let keys = [];

  rawKeyMap.forEach((aValue, aKey, aMap) => { keys.push(aValue) });
  keys = keys.sort();

  let keyCount = keys.length;
  let keyMap = {};

  for (let i = 0; i < keyCount; i++) {
    let clippingURI = rawKeyMap.get(keys[i]);
    let clippingName = gClippingsSvc.getName(clippingURI);

    keyMap[keys[i]] = {
      name: clippingName,
      uri:  clippingURI
    };
  }

  let dlgArgs = {
    keyMap:   keyMap,
    keyCount: keyCount,
    showInsertClippingCmd: false
  };
  dlgArgs.printToExtBrowser = aeUtils.getHostAppID() == aeConstants.HOSTAPP_TB_GUID;

  // Position the help window so that it is relative to the Clippings Manager
  // window.
  let wndFeatures = aeString.format("top=%d,left=%d,resizable", window.screenY+72, window.screenX+128);
  let helpWnd = window.openDialog("chrome://clippings/content/shortcutHelp.xul", "clipkey_help", wndFeatures, dlgArgs);
  helpWnd.focus();
}


function showHelp() 
{
  updateCurrentClippingData();

  openHelpDialog(gStrBundle.getString("clipmanHlp"),
		 gStrBundle.getString("clippingsMgrHelp"));
}


function openHelpDialog(aHelpTitle, aHelpText)
{
  window.openDialog("chrome://clippings/content/miniHelp.xul", "ae_minihlp_wnd", "centerscreen,dialog,modal", aHelpTitle, aHelpText);
}



//
// Window geometry persistence
//


function windowMove()
{
  var coords = aeUtils.getPref("clippings.clipmgr.wnd_position", "48,96").split(",");

  if (isJSWindowGeometryPersistenceEnabled() 
      && window.windowState != WINDOWSTATE_MAXIMIZE && !isWindowMinimized()) {
    if (coords[0] != window.screenX || coords[1] != window.screenY) {
      aeUtils.setPref("clippings.clipmgr.wnd_position",
                      window.screenX + "," + window.screenY);
    }
  }
}


function windowResize()
{
  if (isJSWindowGeometryPersistenceEnabled() && window.windowState != WINDOWSTATE_MAXIMIZE) {
    aeUtils.setPref("clippings.clipmgr.wnd_size",
                    window.outerWidth + "," + window.outerHeight);
  }
}


function setWindowGeometry()
{
  aeUtils.log("Reading extension preferences to retrieve Clippings Manager window size and position");

  var coords = aeUtils.getPref("clippings.clipmgr.wnd_position", "48,96").split(",");
  var rect = aeUtils.getPref("clippings.clipmgr.wnd_size", "556,356").split(",");
  aeUtils.log(aeString.format("Retrieving saved window dimensions: (%s)", rect.toString()));

  window.moveTo(coords[0], coords[1]);
  window.resizeTo(rect[0], rect[1]);

  var wasWindowMaximized = aeUtils.getPref("clippings.clipmgr.is_maximized", false);

  if (wasWindowMaximized) {
    window.maximize();
  }
}


function saveWindowGeometry()
{
  aeUtils.log(aeString.format("Clippings Manager window state: %s\n(1=maximized, 2=minimized, 3=normal)", window.windowState));
  aeUtils.log("Saving Clippings Manager window size and position into extension preferences");

  aeUtils.setPref("clippings.clipmgr.is_maximized", isWindowMaximized());

  if (isWindowMaximized()) {
    aeUtils.log(aeString.format("Window maximized; dimensions: (%d,%d)", window.outerWidth, window.outerHeight));
  }

  if (!isWindowMinimized() && !isWindowMaximized()) {
    aeUtils.setPref("clippings.clipmgr.wnd_position",
                    window.screenX + "," + window.screenY);
    aeUtils.log(aeString.format("Clippings Mgr window dimensions: (%d,%d)", window.outerWidth, window.outerHeight));

    aeUtils.setPref("clippings.clipmgr.wnd_size",
                    window.outerWidth + "," + window.outerHeight);
  }
}


function isJSWindowGeometryPersistenceEnabled()
{
  return (! (aeUtils.getPref("clippings.clipmgr.disable_js_window_geometry_persistence", false)));
}


function isWindowMaximized()
{
  return (window.windowState == WINDOWSTATE_MAXIMIZE);
}


function isWindowMinimized()
{
  return (window.windowState == WINDOWSTATE_MINIMIZE);
}
