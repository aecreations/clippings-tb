/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// This source file is shared by both new.xul and newFolder.xul
//

const {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
const {aeString} = ChromeUtils.import("resource://clippings/modules/aeString.js");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
const {aeClippingLabelPicker} = ChromeUtils.import("resource://clippings/modules/aeClippingLabelPicker.js");
const {aeClippingsTree} = ChromeUtils.import("resource://clippings/modules/aeClippingsTree.js");


var gDlgArgs = window.arguments[0].wrappedJSObject;
var gFolderMenu, gStrBundle;
var gClippingsSvc;
var gFolderTree;
var gSelectedFolderURI;

// Used in new.xul only
var gClippingName, gClippingText, gCreateAsUnquoted, gRemoveExtraLineBreaks;
var gClippingKey;
var gIsFolderCreated;
var gClippingLabelPicker;

// Used in newFolder.xul only
var gFolderName;

// Listener object passed to the aeClippingLabelPicker object
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


//
// DOM utility function
//

function $(aID)
{
  return document.getElementById(aID);
}


//
// Dialog box functions for both new.xul and newFolder.xul
//
    
function init()
{
  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    alert(e);
    window.close();
  }

  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
  gFolderMenu = $("folder-menu-button");
  gFolderTree = aeClippingsTree.createInstance($("folder-tree"));
  gFolderTree.foldersOnly = true;
  gFolderTree.showRootFolder = true;
  gFolderTree.build();

  document.addEventListener("dialogaccept", aEvent => {
    if (! accept()) {
      aEvent.preventDefault();
    }
  });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
  
  // newFolder.xul
  if (window.location.href == "chrome://clippings/content/newFolder.xul") {
    gFolderName = $("folder-name");
    gFolderName.value = gStrBundle.getString("newFolderName");
    gFolderName.clickSelectsAll = true;
    chooseFolder(gDlgArgs.parentFolderURI);
  }
  // new.xul
  else {
    gClippingName = $("clipping-name");
    gClippingText = $("clipping-text");
    gClippingKey  = $("clipping-key");
    gCreateAsUnquoted = $("create-as-unquoted");
    gRemoveExtraLineBreaks = $("remove-extra-linebreaks");
    var app = gStrBundle.getString("pasteIntoTb");
    var hint = gStrBundle.getFormattedString("shortcutKeyHint", [app]);

    let os = aeUtils.getOS();

    if (os == "Darwin") {
      // On Mac OS X, OS_TARGET is "Darwin"
      // Shortcut key hint text is different due to Mac OS X-specific issue
      // with shortcut key prefix; see bug 18879
      hint = gStrBundle.getFormattedString("shortcutKeyHintMac", [app]);

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

    $("shortcut-key-hint").setAttribute("tooltiptext", hint);

    $("tb-create-options-grid").style.display = "-moz-grid";
    // If there are no message quotation symbols in gDlgArgs.text, then
    // disable the "Create as unquoted text" checkbox.
    if (gDlgArgs.text.search(/^>/gm) == -1) {
      gCreateAsUnquoted.disabled = true;
    }
    
    gClippingName.value = gDlgArgs.name;
    gClippingText.value = gDlgArgs.text;
    gClippingName.clickSelectsAll = true;
    gClippingText.clickSelectsAll = true;

    // Automatic spell checking
    var isSpellCheckingEnabled = aeUtils.getPref("clippings.check_spelling", true);

    if (isSpellCheckingEnabled) {
      gClippingName.setAttribute("spellcheck", "true");
      gClippingText.setAttribute("spellcheck", "true");
    }

    gIsFolderCreated = false;
    gSelectedFolderURI = gClippingsSvc.kRootFolderURI;

    // Special label picker widget for Linux (due to issue #50)
    if (os != "WINNT" && os != "Darwin") {
      $("clipping-label-deck").selectedIndex = 1;
      gClippingLabelPickerListener.init("clipping-label-2");
      gClippingLabelPicker = aeClippingLabelPicker.createInstance($("clipping-label-menupopup-2"));
    }
    else {
      $("clipping-label-deck").selectedIndex = 0;
      gClippingLabelPickerListener.init("clipping-label");
      gClippingLabelPicker = aeClippingLabelPicker.createInstance($("clipping-label-menupopup"));
    }
    gClippingLabelPicker.addListener(gClippingLabelPickerListener);
  }
}


function toggleFolderPicker()
{
  let fldrMenuBtn = $("folder-menu-button");
  let fldrPickerPanel = $("folder-picker");

  if (fldrPickerPanel.state == "open") {
    fldrPickerPanel.hidePopup;
  }
  else {
    fldrPickerPanel.openPopup(fldrMenuBtn, "after_start", 0, 0, false, false);
  }
}


function checkForChangedFolders()
{
  if (isFolderMissing(gSelectedFolderURI)) {
    aeUtils.log("Folder does not exist.  Defaulting to root folder.");
    gSelectedFolderURI = gClippingsSvc.kRootFolderURI;
    gFolderMenu.label = gStrBundle.getString("clippingsRoot");
    gFolderMenu.style.listStyleImage  = "url('chrome://clippings/skin/images/clippings-root.svg')";
  }  
}


function isFolderMissing(aFolderURI)
{
  var rv = false;
  var exists;

  try {
    exists =  gClippingsSvc.exists(aFolderURI);
  }
  catch (e) {}

  if (! exists) {
    rv = true;
  }
  else {
    // Folders that exist, but have a detached parent folder, also qualify
    // as "missing."
    var parentURI;
    try {
      parentURI = gClippingsSvc.getParent(aFolderURI);
    }
    catch (e) {
      rv = true;
    }

    while (!rv && parentURI && parentURI != gClippingsSvc.kRootFolderURI) {
      if (gClippingsSvc.isDetached(parentURI)) {
	rv = true;
      }

      try {
	parentURI = gClippingsSvc.getParent(parentURI);
      }
      catch (e) {
	rv = true;
      }
    }
  }

  return rv;
}


function chooseFolder(aFolderURI)
{
  let fldrURI = aFolderURI ? aFolderURI : gFolderTree.selectedURI; 
  gSelectedFolderURI = fldrURI;

  let fldrPickerPanel = $("folder-picker");
  fldrPickerPanel.hidePopup();

  if (fldrURI == gClippingsSvc.kRootFolderURI) {
    gFolderMenu.setAttribute("label", gStrBundle.getString("clippingsRoot"));
    gFolderMenu.style.listStyleImage = "url('chrome://clippings/skin/images/clippings-root.svg')";
  }
  else if (fldrURI == gClippingsSvc.kSyncFolderURI) {
    gFolderMenu.setAttribute("label", gStrBundle.getString("syncFldrLabel"));
    gFolderMenu.style.listStyleImage = "url('chrome://clippings/skin/images/synced-clippings.svg')";
  }
  else {
    gFolderMenu.setAttribute("label", gClippingsSvc.getName(fldrURI));
    gFolderMenu.style.listStyleImage = "url('chrome://clippings/skin/images/folder.svg')";
  }
}


// new.xul only
function createFolder()
{
  var dlgArgs = { 
    parentFolderURI: gSelectedFolderURI || gClippingsSvc.kRootFolderURI
  };

  // Temporarily disable widgets in New Clipping dialog while New Folder
  //  dialog is open.
  var okBtn = document.documentElement.getButton("accept");
  var cancelBtn = document.documentElement.getButton("cancel");
  var dlgElts = document.getElementsByTagName("*");
  var dlgEltsLen = dlgElts.length;

  for (let i = 0; i < dlgEltsLen; i++) {
    dlgElts[i].disabled = true;
  }
  okBtn.disabled = true;
  cancelBtn.disabled = true;

  dlgArgs.wrappedJSObject = dlgArgs;
  window.openDialog("chrome://clippings/content/newFolder.xul", "newfldr_dlg", "dialog,modal,centerscreen", dlgArgs);

  // After New Folder dialog is dismissed, re-enable New Clipping dlg widgets.
  for (let i = 0; i < dlgEltsLen; i++) {
    // Sometimes dlgElts[i] is undefined; not sure why, but check for it anyway
    if (dlgElts[i]) {
      dlgElts[i].disabled = false;
    }
  }
  okBtn.disabled = false;
  cancelBtn.disabled = false;

  if (dlgArgs.userCancel) {
    return;
  }

  gFolderTree.rebuild();
  chooseFolder(dlgArgs.newFolderURI);
  gIsFolderCreated = true;
}


// new.xul only
function updateShortcutKeyAvailability()
{
  let msgTxtNode = $("key-conflict-notification").firstChild;

  if (gClippingKey.selectedIndex == 0) {
    msgTxtNode.data = gStrBundle.getString("shortcutKeyNoneAssigned");
    return;
  }

  let selectedKey = gClippingKey.selectedItem.label;
  let keyMap = gClippingsSvc.getShortcutKeyMap();

  if (keyMap.has(selectedKey)) {
    msgTxtNode.data = gStrBundle.getString("shortcutKeyUsed");
  }
  else {
    msgTxtNode.data = gStrBundle.getString("shortcutKeyNoneAssigned");
  }
}


// new.xul only
function toggleOptions()
{
  let clippingOptions = $("clipping-options");

  if (clippingOptions.hidden) {
    clippingOptions.hidden = false;
    window.sizeToContent();
    $("toggle-options").disabled = true;
  }
}


// new.xul only - when alternative label picker menu is used.
function setSelectedLabel(aLabelClassName)
{
  let label = aLabelClassName.substring(aLabelClassName.lastIndexOf("-")+1, aLabelClassName.length);
  gClippingLabelPicker.selectedLabel = label;
}


function validateClippingName(aEvent)
{
  let clippingName = aEvent.target;
  if (clippingName.value == "") {
    clippingName.value = gStrBundle.getString("untitledClipping");
  }
}


function validateFolderName(aEvent)
{
  let folderName = aEvent.target;
  if (folderName.value == "") {
    folderName.value = gStrBundle.getString("untitledFolder");
  }
}


function accept() 
{
  if (! gSelectedFolderURI) {
    gSelectedFolderURI = gClippingsSvc.kRootFolderURI;
  }
  else {
    checkForChangedFolders();
  }

  // newFolder.xul
  if (window.location.href == "chrome://clippings/content/newFolder.xul") {
    var name = gFolderName.value;
    var uri = gClippingsSvc.createNewFolderEx(gSelectedFolderURI, null, name, null, false, gClippingsSvc.ORIGIN_NEW_CLIPPING_DLG);
    gDlgArgs.newFolderURI = uri;
  }
  // new.xul
  else {
    var clipText = gClippingText.value;

    // Thunderbird only
    if (gCreateAsUnquoted.checked) {
      clipText = clipText.replace(/^>>* ?(>>* ?)*/gm, "");
    }
    if (gRemoveExtraLineBreaks.checked) {
      clipText = clipText.replace(/([^\n])( )?\n([^\n])/gm, "$1 $3");
    }

    gDlgArgs.name = gClippingName.value;
    gDlgArgs.text = clipText;
    gDlgArgs.destFolder = gSelectedFolderURI;

    // Label
    gDlgArgs.label = gClippingLabelPicker.selectedLabel;

    // Shortcut key
    if (gClippingKey.selectedIndex > 0) {
      let selectedKey = gClippingKey.selectedItem.label;

      // Check if the key is already assigned to another clipping
      let keyMap = gClippingsSvc.getShortcutKeyMap();

      if (keyMap.has(selectedKey)) {
	aeUtils.alertEx(gStrBundle.getString("appName"),
	   	       gStrBundle.getString("errorShortcutKeyDetail"));
	gClippingKey.focus();
	return false;
      }

      gDlgArgs.key = selectedKey;
    }

    gClippingLabelPicker.removeListener(gClippingLabelPickerListener);
  }

  gDlgArgs.userCancel = false;
  return true;
}


function cancel() 
{
  if (window.location.href == "chrome://clippings/content/new.xul") {
    if (gIsFolderCreated) {
      gDlgArgs.destFolder = gSelectedFolderURI;
    }
    gClippingLabelPicker.removeListener(gClippingLabelPickerListener);
  }

  gDlgArgs.userCancel = true;
  return true;
}
