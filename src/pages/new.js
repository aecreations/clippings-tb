/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


const WNDH_NORMAL = 410;
const WNDH_NORMAL_WINDOWS = 434;
const WNDH_OPTIONS_EXPANDED = 500;
const DLG_HEIGHT_ADJ_WINDOWS = 24;
const DLG_HEIGHT_ADJ_LINUX = 60;
const DLG_HEIGHT_ADJ_LOCALE = 20;
const DLG_HEIGHT_ADJ_LOCALE_DE = 10;

let gEnvInfo;
let gClippingsDB = null;
let gParentFolderID = 0;
let gSrcURL = "";
let gCreateInFldrMenu;
let gFolderPickerPopup;
let gNewFolderDlg, gPreviewDlg, gSyncErrMsgBox;
let gPrefs;
let gSyncedFldrIDs = new Set();


// Page initialization
$(async () => {
  aeClippings.init();
  gClippingsDB = aeClippings.getDB();
  
  try {
    await aeClippings.verifyDB();
  }
  catch (e) {
    showInitError();
    return;
  };

  gEnvInfo = await messenger.runtime.sendMessage({msgID: "get-env-info"});

  // Platform-specific initialization.
  document.body.dataset.os = gEnvInfo.os;

  gPrefs = await aePrefs.getAllPrefs();

  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;

  if (gPrefs.syncClippings) {
    initSyncItemsIDLookupList();
  }

  expandOptions(gPrefs.showNewClippingOpts);

  $("#btn-expand-options").data("isExpanded", gPrefs.showNewClippingOpts).on("click", aEvent => {
    let isExpanded = $(aEvent.target).data("isExpanded");
    expandOptions(! isExpanded);
  });
  
  $("#clipping-text").attr("placeholder", messenger.i18n.getMessage("clipMgrContentHint"));
  
  messenger.runtime.sendMessage({
    msgID: "init-new-clipping-dlg"
  }).then(aResp => {
    if (! aResp) {
      console.warn("Clippings/mx::new.js: No response was received from the background script!");
      return;
    }

    let clippingName = $("#clipping-name")[0];
    clippingName.value = aResp.name;
    clippingName.focus();
    
    $("#clipping-text").val(aResp.content).attr("spellcheck", aResp.checkSpelling)
      .focus(aEvent => {
        aEvent.target.select();
      });
    gSrcURL = aResp.url || "";
  });

  $("#clipping-name").focus(aEvent => {
    aEvent.target.select();
  });
  
  $("#clipping-name").blur(aEvent => {
    let name = aEvent.target.value;
    if (! name) {
      $("#clipping-name").val(messenger.i18n.getMessage("untitledClipping"));
    }
  });

  initDialogs();
  initFolderPicker();
  initLabelPicker();
  initShortcutKeyMenu();

  let newFolderBtn = $("#new-folder-btn");
  newFolderBtn.attr("title", messenger.i18n.getMessage("btnNewFolder"));
  newFolderBtn.on("click", aEvent => { gNewFolderDlg.showModal() });
  
  $("#show-preview").on("click", aEvent => { gPreviewDlg.showModal() });
  $("#btn-accept").on("click", aEvent => { accept(aEvent) });
  $("#btn-cancel").on("click", aEvent => { cancel(aEvent) });

  aeVisual.init(gEnvInfo.os);
  aeVisual.preloadMsgBoxIcons();
  aeVisual.cacheIcons(
    "tree-fldr-open.svg",
    "tree-fldr-close.svg",
    "tree-fldr-open-dk.svg",
    "tree-fldr-close-dk.svg"
  );

  aeInterxn.init(gEnvInfo.os);
  if (gPrefs.defDlgBtnFollowsFocus) {
    aeInterxn.initDialogButtonFocusHandlers();
  }

  window.focus();

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


async function expandOptions(aIsOptionsExpanded)
{
  let lang = messenger.i18n.getUILanguage();

  if (aIsOptionsExpanded) {
    let height = WNDH_OPTIONS_EXPANDED;
    if (gEnvInfo.os == "win") {
      height += DLG_HEIGHT_ADJ_WINDOWS;
    }
    else if (gEnvInfo.os == "linux") {
      height += DLG_HEIGHT_ADJ_LINUX;
    }
    
    if (lang == "uk" || lang.startsWith("pt") || lang.startsWith("es")) {
      height += DLG_HEIGHT_ADJ_LOCALE;
    }

    await messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, {height});
    $("#clipping-options").show();
    $("#new-clipping-fldr-tree-popup").addClass("new-clipping-fldr-tree-popup-fixpos");
    $("#btn-expand-options").addClass("expanded");
  }
  else {
    let height = WNDH_NORMAL;
    if (gEnvInfo.os == "win") {
      height = WNDH_NORMAL_WINDOWS;
    }
    else if (gEnvInfo.os == "linux") {
      height += DLG_HEIGHT_ADJ_LINUX;
    }

    $("#clipping-options").hide();
    $("#new-clipping-fldr-tree-popup").removeClass("new-clipping-fldr-tree-popup-fixpos");
    $("#btn-expand-options").removeClass("expanded");
    await messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, {height});
  }

  $("#btn-expand-options").data("isExpanded", aIsOptionsExpanded);
  await aePrefs.setPrefs({showNewClippingOpts: aIsOptionsExpanded});
}


$(window).on("keydown", aEvent => {
  if (aEvent.key == "Enter") {
    if (aEvent.target.tagName == "TEXTAREA") {
      return;
    }

    if (aEvent.target.tagName == "BUTTON" && aEvent.target.id != "btn-accept"
        && !aEvent.target.classList.contains("dlg-accept")) {
      aEvent.target.click();
      return;
    }

    if (aEvent.target.tagName == "UL" && aEvent.target.classList.contains("ui-fancytree")) {
      let selectedFldrNodeKey;
      let fldrData;

      if (aeDialog.isOpen()) {
        // New Folder modal lightbox.
        gNewFolderDlg.selectAndCloseFolderPicker();
        $("#new-folder-dlg-fldr-picker-mnubtn").focus();
      }
      else {
        selectAndCloseFolderPicker();
        $("#new-clipping-fldr-picker-menubtn").focus();
      }

      return;
    }

    if (aeDialog.isOpen()) {
      // Avoid duplicate invocation due to pressing ENTER while OK button
      // is focused in the New Clipping dialog.
      if (! aEvent.target.classList.contains("dlg-accept")) {
        aeDialog.acceptDlgs();
      }
      return;
    }

    if (aEvent.target.id != "btn-accept") {
      accept(aEvent);
    }
  }
  else if (aEvent.key == "Escape") {
    if (aEvent.target.tagName == "UL" && aEvent.target.classList.contains("ui-fancytree")) {
      if (aeDialog.isOpen()) {
        // New Folder modal lightbox.
        gNewFolderDlg.closeFolderPicker();
        $("#new-folder-dlg-fldr-picker-mnubtn").focus();
      }
      else {
        closeFolderPicker();
        $("#new-clipping-fldr-picker-menubtn").focus();
      }

      return;
    }
    
    if (aeDialog.isOpen()) {
      aeDialog.cancelDlgs();
      return;
    }
    cancel(aEvent);
  }
  else if (aEvent.key == "ArrowDown") {
    if (aEvent.target.classList.contains("folder-picker-menubtn")) {
      if (aeDialog.isOpen()) {
        // New Folder modal lightbox.
        gNewFolderDlg.openFolderPicker();
      }
      else {
        openFolderPicker();
      }
    }
  }
});


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


function showInitError()
{
  let errorMsgBox = new aeDialog("#create-clipping-error-msgbox");
  errorMsgBox.onInit = function ()
  {
    let errMsgElt = $("#create-clipping-error-msgbox > .dlg-content > .msgbox-error-msg");
    errMsgElt.text(messenger.i18n.getMessage("initError"));
  };
  errorMsgBox.onAccept = function ()
  {
    this.close();
    closeDlg();
  };
  
  errorMsgBox.showModal();
}


function initDialogs()
{
  $(".msgbox-error-icon").attr("os", gEnvInfo.os);
  
  gNewFolderDlg = new aeDialog("#new-folder-dlg");
  gNewFolderDlg.setProps({
    fldrTree: null,
    selectedFldrNode: null,
  });

    gNewFolderDlg.openFolderPicker = function ()
  {
    $("#new-folder-dlg-fldr-tree-popup").css({visibility: "visible"});
    $("#new-folder-dlg-fldr-tree-popup-bkgrd-ovl").show();
    this.fldrTree.getContainer().focus();
  };

  gNewFolderDlg.selectFolder = function (aFolderData)
  {
    if (gPrefs.syncClippings && gPrefs.isSyncReadOnly) {
      let folderID = Number(aFolderData.node.key);
      if (folderID == gPrefs.syncFolderID || gSyncedFldrIDs.has(folderID)) {
        // This should never happen, because the Synced Clippings folder
        // won't appear in the folder list when the sync file is read-only.
        alert(messenger.i18n.getMessage("syncFldrRdOnly"));
        return;
      }
    }

    this.selectedFldrNode = aFolderData.node;

    let fldrID = aFolderData.node.key;
    let fldrPickerMnuBtn = $("#new-folder-dlg-fldr-picker-mnubtn");
    fldrPickerMnuBtn.val(fldrID).text(aFolderData.node.title);

    if (fldrID == gPrefs.syncFolderID) {
      fldrPickerMnuBtn.attr("syncfldr", "true");
    }
    else {
      fldrPickerMnuBtn.removeAttr("syncfldr");
    }

    $("#new-folder-dlg-fldr-tree-popup").css({visibility: "hidden"});
    $("#new-folder-dlg-fldr-tree-popup-bkgrd-ovl").hide();

  };

  gNewFolderDlg.selectAndCloseFolderPicker = function ()
  {
    let fldrPickerTree = gNewFolderDlg.fldrTree.getTree();
    selectedFldrNodeKey = fldrPickerTree.activeNode.key;
    let fldrData = {
      node: {
        key: selectedFldrNodeKey,
        title: fldrPickerTree.activeNode.title,
      }
    };
    gNewFolderDlg.selectFolder(fldrData);
  };

  gNewFolderDlg.closeFolderPicker = function ()
  {
    $("#new-folder-dlg-fldr-tree-popup").css({visibility: "hidden"});
    $("#new-folder-dlg-fldr-tree-popup-bkgrd-ovl").hide();
  };

  gNewFolderDlg.resetTree = function ()
  {
    let fldrTree = this.fldrTree.getTree();
    fldrTree.clear();
    this.fldrTree = null;
    this.selectedFldrNode = null;

    // Remove and recreate the Fancytree <div> element.
    $("#new-folder-dlg-fldr-tree").children().remove();
    let parentElt = $("#new-folder-dlg-fldr-tree").parent();
    parentElt.children("#new-folder-dlg-fldr-tree").remove();
    $('<div id="new-folder-dlg-fldr-tree" class="folder-tree"></div>').appendTo("#new-folder-dlg-fldr-tree-popup");
  };

  gNewFolderDlg.onFirstInit = function ()
  {
    let fldrPickerPopup = $("#new-folder-dlg-fldr-tree-popup");

    $("#new-folder-dlg-fldr-picker-mnubtn").on("click", aEvent => {
      if (fldrPickerPopup.css("visibility") == "visible") {
        this.closeFolderPicker();
      }
      else {
        this.openFolderPicker();
      }
    });
    
    $("#new-fldr-name").on("blur", aEvent => {
      if (! aEvent.target.value) {
        aEvent.target.value = messenger.i18n.getMessage("newFolder");
      }
    });
  };
  
  gNewFolderDlg.onInit = function ()
  {
    let parentDlgFldrPickerMnuBtn = $("#new-clipping-fldr-picker-menubtn");
    let fldrPickerMnuBtn = $("#new-folder-dlg-fldr-picker-mnubtn");
    let fldrPickerPopup = $("#new-folder-dlg-fldr-tree-popup");
    let selectedFldrID = parentDlgFldrPickerMnuBtn.val();
    let selectedFldrName = parentDlgFldrPickerMnuBtn.text();
    let rootFldrID = aeConst.ROOT_FOLDER_ID;
    let rootFldrName = messenger.i18n.getMessage("rootFldrName");
    let rootFldrCls = aeFolderPicker.ROOT_FOLDER_CLS;
    
    if (gPrefs.syncClippings) {
      if (gPrefs.newClippingSyncFldrsOnly) {
        rootFldrID = gPrefs.syncFolderID;
        rootFldrName = messenger.i18n.getMessage("syncFldrName");
        rootFldrCls = aeFolderPicker.SYNCED_ROOT_FOLDER_CLS;
      }
      else if (gPrefs.cxtMenuSyncItemsOnly) {
        $("#new-folder-dlg-fldr-tree").addClass("show-sync-items-only");
      }
    }

    let hideSyncFldr = gPrefs.isSyncReadOnly && !gPrefs.cxtMenuSyncItemsOnly;
    this.fldrTree = new aeFolderPicker(
      "#new-folder-dlg-fldr-tree",
      gClippingsDB,
      rootFldrID,
      rootFldrName,
      rootFldrCls,
      selectedFldrID,
      hideSyncFldr
    );

    this.fldrTree.onSelectFolder = aFolderData => {
      this.selectFolder(aFolderData);
    };

    fldrPickerMnuBtn.val(selectedFldrID).text(selectedFldrName);
    if (selectedFldrID == gPrefs.syncFolderID) {
      fldrPickerMnuBtn.attr("syncfldr", "true");
    }
    else {
      fldrPickerMnuBtn.removeAttr("syncfldr");
    }

    $("#new-fldr-name").val(messenger.i18n.getMessage("newFolder"));
  };

  gNewFolderDlg.onShow = function ()
  {
    $("#new-fldr-name").select().focus();
  };
  
  gNewFolderDlg.onAccept = function (aEvent)
  {
    let newFldrDlgTree = this.fldrTree.getTree();
    let parentFldrID = aeConst.ROOT_FOLDER_ID;

    if (this.selectedFldrNode) {
      parentFldrID = Number(this.selectedFldrNode.key);
    }
    else {
      // User didn't choose a different parent folder.
      parentFldrID = Number($("#new-folder-dlg-fldr-picker-mnubtn").val());
    }

    log("Clippings/mx::new.js: gNewFolderDlg.onAccept(): parentFldrID = " + parentFldrID);

    let numItemsInParent = 0;  // For calculating display order of new folder.
    let newFolder = {
      name: $("#new-fldr-name").val(),
      parentFolderID: parentFldrID,
      displayOrder: 0,
    };

    if (gPrefs.syncClippings) {
      // Set static ID on new folder if it is a synced folder.
      if (gSyncedFldrIDs.has(parentFldrID)) {
        newFolder.sid = aeUUID();
      }
    }

    gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
      gClippingsDB.folders.where("parentFolderID").equals(parentFldrID).count().then(aNumFldrs => {
        numItemsInParent += aNumFldrs;
        return gClippingsDB.clippings.where("parentFolderID").equals(parentFldrID).count();
        
      }).then(aNumClippings => {
        numItemsInParent += aNumClippings;
        newFolder.displayOrder = numItemsInParent;
        return gClippingsDB.folders.get(parentFldrID);

      }).then(aFolder => {        
        if (aFolder && aFolder.id != gPrefs.syncFolderID && "sid" in aFolder) {
          newFolder.parentFldrSID = aFolder.sid;
        }

        return gClippingsDB.folders.add(newFolder);

      }).then(aFldrID => {
        let newFldrName = $("#new-fldr-name").val();
      
        // Update the folder tree in the main dialog.
        let newFldrNodeData = {
          key: aFldrID,
          title: newFldrName,
          folder: true,
          children: []
        };
        
        let mainFldrTree = gFolderPickerPopup.getTree();
        let parentNode;
        
        if (parentFldrID == aeConst.ROOT_FOLDER_ID) {
          parentNode = mainFldrTree.rootNode.getFirstChild();
        }
        else {
          parentNode = mainFldrTree.getNodeByKey(Number(parentFldrID).toString());
        }
        
        let newFldrNode = parentNode.addNode(newFldrNodeData);
        newFldrNode.setActive();
        
        $("#new-clipping-fldr-picker-menubtn").text(newFldrName).val(aFldrID);
        let mainFldrPickerMenuBtn = $("#new-clipping-fldr-picker-menubtn");
        mainFldrPickerMenuBtn.text(newFldrName).val(aFldrID).removeAttr("syncfldr");
        gParentFolderID = aFldrID;
        
        this.resetTree();

        messenger.runtime.sendMessage({
          msgID: "new-folder-created",
          newFolderID: aFldrID,
          newFolder,
          origin: aeConst.ORIGIN_HOSTAPP,
        });
        
        return unsetClippingsUnchangedFlag();

      }).then(() => {
        this.close();
      });
    }).catch(aErr => {
      window.alert(aErr);
    });  
  };

  gPreviewDlg = new aeDialog("#preview-dlg");
  gPreviewDlg.onShow = function ()
  {
    let content = $("#clipping-text").val();

    if ($("#create-as-unquoted")[0].checked) {
      content = formatUnquoted(content);
    }
    if ($("#remove-extra-linebreaks")[0].checked) {
      content = formatRemoveLineBreaks(content);
    }

    $("#clipping-preview").val(content);
  };

  gPreviewDlg.onAccept = function (aEvent)
  {
    $("#clipping-preview").val("");
    this.close();
  };

  gSyncErrMsgBox = new aeDialog("#sync-fldr-full-error-msgbox");
}


function initFolderPicker()
{
  function selectSyncedClippingsFldr()
  {
    $("#new-clipping-fldr-picker-menubtn").val(gPrefs.syncFolderID)
      .text(messenger.i18n.getMessage("syncFldrName"))
      .attr("syncfldr", "true");
  }
  
  // Initialize the transparent background that user can click on to dismiss an
  // open folder picker popup.
  $(".popup-bkgrd").on("click", aEvent => {
    $(".folder-tree-popup").css({ visibility: "hidden" });
    $(".popup-bkgrd").hide();
  });

  // Initialize the folder picker in the main New Clipping dialog.
  $("#new-clipping-fldr-picker-menubtn").on("click", aEvent => {
    let popup = $("#new-clipping-fldr-tree-popup");

    if (popup.css("visibility") == "hidden") {
      openFolderPicker();
    }
    else {
      closeFolderPicker();
      aEvent.target.focus();
    }
  });

  // Set the width of the folder picker drop-down to match the width of the menu
  // button that opens it.
  let menuBtnStyle = window.getComputedStyle($("#new-clipping-fldr-picker-menubtn")[0]);
  let menuBtnWidth = parseInt(menuBtnStyle.width);
  
  // Need to add 1px to the popup width to compensate for having to add 1 pixel
  // to the width of the New Clipping popup window.
  $("#new-clipping-fldr-tree-popup").css({ width: `${menuBtnWidth + 1}px` });
  
  let rootFldrID = aeConst.ROOT_FOLDER_ID;
  let rootFldrName = messenger.i18n.getMessage("rootFldrName");
  let rootFldrCls = aeFolderPicker.ROOT_FOLDER_CLS;
  let selectedFldrID = aeConst.ROOT_FOLDER_ID;

  if (gPrefs.syncClippings) {
    if (gPrefs.newClippingSyncFldrsOnly) {
      selectSyncedClippingsFldr();
      rootFldrID = gPrefs.syncFolderID;
      rootFldrName = messenger.i18n.getMessage("syncFldrName");
      rootFldrCls = aeFolderPicker.SYNCED_ROOT_FOLDER_CLS;
    }
    else if (gPrefs.cxtMenuSyncItemsOnly) {
      selectSyncedClippingsFldr();
      $("#new-clipping-fldr-tree").addClass("show-sync-items-only");
      selectedFldrID = gPrefs.syncFolderID;

      // Handle read-only sync folder.
      if (gPrefs.isSyncReadOnly) {
        $("#new-clipping-fldr-picker-menubtn").prop("disabled", true);
        $("#new-folder-btn").prop("disabled", true);
        $("#btn-accept").prop("disabled", true).removeClass("default");
        $("#btn-cancel").addClass("default");
        return;
      }
    }
  }
  
  let hideSyncFldr = gPrefs.isSyncReadOnly && !gPrefs.cxtMenuSyncItemsOnly;
  gFolderPickerPopup = new aeFolderPicker(
    "#new-clipping-fldr-tree",
    gClippingsDB,
    rootFldrID,
    rootFldrName,
    rootFldrCls,
    selectedFldrID,
    hideSyncFldr
  );

  gFolderPickerPopup.onSelectFolder = selectFolder;
}


function openFolderPicker()
{
  $("#new-clipping-fldr-tree-popup").css({visibility: "visible"});
  $(".popup-bkgrd").show();
  gFolderPickerPopup.getContainer().focus();
}


function selectFolder(aFolderData)
{
  if (gPrefs.syncClippings && gPrefs.isSyncReadOnly) {
    let folderID = Number(aFolderData.node.key);
    if (folderID == gPrefs.syncFolderID || gSyncedFldrIDs.has(folderID)) {
      alert(messenger.i18n.getMessage("syncFldrRdOnly"));
      return;
    }
  }

  gParentFolderID = Number(aFolderData.node.key);
  
  let fldrPickerMenuBtn = $("#new-clipping-fldr-picker-menubtn");
  fldrPickerMenuBtn.text(aFolderData.node.title).val(gParentFolderID);

  if (gParentFolderID == gPrefs.syncFolderID) {
    fldrPickerMenuBtn.attr("syncfldr", "true");
  }
  else {
    fldrPickerMenuBtn.removeAttr("syncfldr");
  }
  
  $("#new-clipping-fldr-tree-popup").css({visibility: "hidden"});
  $(".popup-bkgrd").hide();
}


function selectAndCloseFolderPicker()
{
  let fldrPickerTree = gFolderPickerPopup.getTree();
  selectedFldrNodeKey = fldrPickerTree.activeNode.key;
  let fldrData = {
    node: {
      key: selectedFldrNodeKey,
      title: fldrPickerTree.activeNode.title,
    }
  };
  selectFolder(fldrData);
}


function closeFolderPicker()
{
  $("#new-clipping-fldr-tree-popup").css({visibility: "hidden"});
  $(".popup-bkgrd").hide();
}


async function initShortcutKeyMenu()
{
  let shortcutKeyMenu = $("#clipping-key")[0];

  let assignedKeysLookup = {};
  gClippingsDB.clippings.where("shortcutKey").notEqual("").each((aItem, aCursor) => {
    assignedKeysLookup[aItem.shortcutKey] = 1;
  }).then(() => {
    for (let option of shortcutKeyMenu.options) {
      if (assignedKeysLookup[option.text]) {
        option.setAttribute("disabled", "true");
        option.setAttribute("title", messenger.i18n.getMessage("shortcutKeyAssigned", option.text));
      }
    }
  });

  let keybPasteKeys = await messenger.runtime.sendMessage({msgID: "get-shct-key-prefix-ui-str"});
  let tooltip = messenger.i18n.getMessage("shctKeyHintTB", keybPasteKeys);
  $("#shct-key-tooltip-text").attr("title", tooltip);
}


function initLabelPicker()
{
  $("#clipping-label-picker").on("change", aEvent => {
    let label = aEvent.target.value;
    let color = label;

    if (! label) {
      color = "black";
    }
    else if (label == "yellow") {
      color = "rgb(200, 200, 0)";
    }
    $(aEvent.target).css({ color });
  });
}


function initSyncItemsIDLookupList()
{
  function initSyncItemsIDLookupListHelper(aFolderID)
  {
    return new Promise((aFnResolve, aFnReject) => {
      gClippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
        gSyncedFldrIDs.add(aItem.id);
        initSyncItemsIDLookupListHelper(aItem.id);

      }).then(() => {
        aFnResolve();
      });
    }).catch(aErr => { aFnReject(aErr) });
  }
  // END nested helper function

  return new Promise((aFnResolve, aFnReject) => {
    if (! gPrefs.syncClippings) {
      aFnResolve();
    }

    // Include the ID of the root Synced Clippings folder.
    gSyncedFldrIDs.add(gPrefs.syncFolderID);

    initSyncItemsIDLookupListHelper(gPrefs.syncFolderID).then(() => {
      aFnResolve();
    }).catch(aErr => { aFnReject(aErr) });
  });
}


function isClippingOptionsSet()
{
  return ($("#clipping-key")[0].selectedIndex != 0
          || $("#clipping-label-picker").val() != "");
}


function formatUnquoted(aClippingText)
{
  let rv = aClippingText.replace(/^>>* ?(>>* ?)*/gm, "");
  return rv;
}


function formatRemoveLineBreaks(aClippingText)
{
  let rv = aClippingText.replace(/([^\n])( )?\n([^\n])/gm, "$1 $3");
  return rv;
}


function unsetClippingsUnchangedFlag()
{
  if (gPrefs.clippingsUnchanged) {
    return aePrefs.setPrefs({ clippingsUnchanged: false });
  }
  return Promise.resolve();
}


function setDlgButtonEnabledStates(aIsEnabled)
{
  $("#dlg-buttons > button").prop("disabled", !aIsEnabled);
}


function accept(aEvent)
{
  let name = $("#clipping-name").val();
  let content = $("#clipping-text").val();

  if ($("#create-as-unquoted")[0].checked) {
    content = formatUnquoted(content);
  }
  if ($("#remove-extra-linebreaks")[0].checked) {
    content = formatRemoveLineBreaks(content);
  }
  
  let shortcutKeyMenu = $("#clipping-key")[0];
  let shortcutKey = "";

  if (shortcutKeyMenu.selectedIndex != 0) {
    shortcutKey = shortcutKeyMenu.options[shortcutKeyMenu.selectedIndex].text;
  }

  let labelPicker = $("#clipping-label-picker");
  let label = labelPicker.val() ? labelPicker.val() : "";

  let errorMsgBox = new aeDialog("#create-clipping-error-msgbox");
  let numItemsInParent = 0;  // For calculating display order of new clipping.

  let newClipping = {
    name, content, shortcutKey, label,
    parentFolderID: gParentFolderID,
    displayOrder: 0,
    sourceURL: "",
  };

  if (gPrefs.syncClippings) {
    if (gSyncedFldrIDs.has(newClipping.parentFolderID)) {
      newClipping.sid = aeUUID();
    }
  }

  gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
    gClippingsDB.folders.where("parentFolderID").equals(gParentFolderID).count().then(aNumFldrs => {
      numItemsInParent += aNumFldrs;
      return gClippingsDB.clippings.where("parentFolderID").equals(gParentFolderID).count();

    }).then(aNumClippings => {
      numItemsInParent += aNumClippings;
      newClipping.displayOrder = numItemsInParent;
      return gClippingsDB.folders.get(gParentFolderID);

    }).then(aFolder => {
      if (aFolder && aFolder.id != gPrefs.syncFolderID && "sid" in aFolder) {
        newClipping.parentFldrSID = aFolder.sid;
      }
      return gClippingsDB.clippings.add(newClipping);

    }).then(aNewClippingID => {
      setDlgButtonEnabledStates(false);
      setTimeout(async () => {
        await finishAcceptDlg(aNewClippingID, newClipping);
      }, 100);

    }).catch("OpenFailedError", aErr => {
      setDlgButtonEnabledStates(true);
      // OpenFailedError exception thrown if Firefox is set to "Never remember
      // history."
      errorMsgBox.onInit = () => {
        console.error(`Error creating clipping: ${aErr}`);
        let errMsgElt = $("#create-clipping-error-msgbox > .dlg-content > .msgbox-error-msg");
        errMsgElt.text(messenger.i18n.getMessage("saveClippingError"));
      };
      errorMsgBox.showModal();

    }).catch(aErr => {
      setDlgButtonEnabledStates(true);
      console.error("Clippings/mx::new.js: accept(): " + aErr);     
      errorMsgBox.onInit = () => {
        let errMsgElt = $("#create-clipping-error-msgbox > .dlg-content > .msgbox-error-msg");
        let errText = `Error creating clipping: ${aErr}`;

        if (aErr == aeConst.SYNC_ERROR_CONXN_FAILED
            || aErr == aeConst.SYNC_ERROR_NAT_APP_NOT_FOUND) {
          errText = messenger.i18n.getMessage("syncPushFailed");
          errorMsgBox.onAfterAccept = () => {
            // Despite the native app connection error, the new clipping was
            // successfully created, so just close the main dialog.
            closeDlg();
          };
        }
        errMsgElt.text(errText);
      };
      errorMsgBox.showModal();
    });
  });
}


async function finishAcceptDlg(aNewClippingID, aNewClipping)
{
  if (gPrefs.syncClippings) {
    aeImportExport.setDatabase(gClippingsDB);
        
    let syncData = await aeImportExport.exportToJSON(true, true, gPrefs.syncFolderID, false, true, true);

    let isSyncDataSizeUnderMax = await messenger.runtime.sendMessage({
      msgID: "check-sync-data-size",
      syncData,
    });
    log("Clippings::new.js: finishAcceptDlg(): Response from message 'check-sync-data-size': " + isSyncDataSizeUnderMax);

    if (!isSyncDataSizeUnderMax) {
      gSyncErrMsgBox.showModal();
      setTimeout(async () => {
        await gClippingsDB.clippings.delete(aNewClippingID);
      }, 100);
 
      setDlgButtonEnabledStates(true);
      return;
    }
    
    let natMsg = {
      msgID: "set-synced-clippings",
      syncData: syncData.userClippingsRoot,
    };

    log("Clippings/mx::new.js: accept(): Sending message 'set-synced-clippings' to the Sync Clippings helper app.  Message data:");
    log(natMsg);
        
    let natResp = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, natMsg);
    if (natResp) {
      log("Clippings/mx::new.js: accept(): Response from the Sync Clippings helper app:");
      log(natResp);
    }
  }
  
  await messenger.runtime.sendMessage({
    msgID: "new-clipping-created",
    newClippingID: aNewClippingID,
    newClipping: aNewClipping,
    origin: aeConst.ORIGIN_HOSTAPP,
  });
  await unsetClippingsUnchangedFlag();

  if (gPrefs.clippingsMgrAutoShowDetailsPane && isClippingOptionsSet()) {
    await aePrefs.setPrefs({
      clippingsMgrAutoShowDetailsPane: false,
      clippingsMgrDetailsPane: true,
    });
  }

  closeDlg();  
}


function cancel(aEvent)
{
  closeDlg();
}


async function closeDlg()
{
  await messenger.runtime.sendMessage({ msgID: "close-new-clipping-dlg" });
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


//
// Event handlers
//

messenger.runtime.onMessage.addListener(aRequest => {
  log(`Clippings/mx::new.js: New Clipping dialog received MailExtension message "${aRequest.msgID}"`);

  if (aRequest.msgID == "ping-new-clipping-dlg") {
    let resp = {isOpen: true};
    return Promise.resolve(resp);
  }
});


//
// Utilities
//

function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
