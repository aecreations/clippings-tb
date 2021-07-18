/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


const WNDH_OPTIONS_EXPANDED = 486;
const DLG_HEIGHT_ADJ_WINDOWS = 36;
const DLG_HEIGHT_ADJ_LOCALE_ES = 16;

let gOS;
let gClippingsDB = null;
let gClippings = null;
let gParentFolderID = 0;
let gSrcURL = "";
let gCreateInFldrMenu;
let gFolderPickerPopup;
let gNewFolderDlg, gPreviewDlg;
let gPrefs;


// Page initialization
$(async () => {
  gClippings = messenger.extension.getBackgroundPage();
  
  if (gClippings) {
    gClippingsDB = gClippings.getClippingsDB();
  }
  else {
    // gClippingsDB is null if Private Browsing mode is turned on.
    console.error("Clippings/mx::new.js: Error initializing New Clipping dialog - unable to locate parent browser window.");
    showInitError();
    return;
  }

  try {
    await gClippings.verifyDB();
  }
  catch (e) {
    showInitError();
    return;
  };

  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = gOS = platform.os;

  gPrefs = await aePrefs.getAllPrefs();

  $("#btn-expand-options").click(async (aEvent) => {
    let height = WNDH_OPTIONS_EXPANDED;
    if (gOS == "win") {
      height += DLG_HEIGHT_ADJ_WINDOWS;
    }
    
    let lang = messenger.i18n.getUILanguage();
    if (lang == "es-ES") {
      height += DLG_HEIGHT_ADJ_LOCALE_ES;
    }
    
    await messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, { height });
    $("#clipping-options").show();
    $("#new-clipping-fldr-tree-popup").addClass("new-clipping-fldr-tree-popup-fixpos");
  });
  
  $("#clipping-text").attr("placeholder", messenger.i18n.getMessage("clipMgrContentHint"));
  
  messenger.runtime.sendMessage({
    msgID: "init-new-clipping-dlg"
  }).then(aResp => {
    if (! aResp) {
      console.warn("Clippings/mx::new.js: No response was received from the background script!");
      return;
    }

    $("#clipping-name").val(aResp.name).select().focus();
    $("#clipping-text").val(aResp.content).attr("spellcheck", aResp.checkSpelling);
    gSrcURL = aResp.url || "";
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

  $("#new-folder-btn").click(aEvent => { gNewFolderDlg.showModal() });
  $("#show-preview").click(aEvent => { gPreviewDlg.showModal() });
  $("#btn-accept").click(aEvent => { accept(aEvent) });
  $("#btn-cancel").click(aEvent => { cancel(aEvent) });

  $(document).tooltip(aeInterxn.getTooltipOpts());

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


$(window).keydown(aEvent => {
  if (aEvent.key == "Enter") {
    if (aEvent.target.tagName == "TEXTAREA") {
      return;
    }
    if (aeDialog.isOpen()) {
      aeDialog.acceptDlgs();
      return;
    }
    accept(aEvent);
  }
  else if (aEvent.key == "Escape") {
    if (aeDialog.isOpen()) {
      aeDialog.cancelDlgs();
      return;
    }
    cancel(aEvent);
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
    errorMsgBox.close();
    closeDlg();
  };
  
  errorMsgBox.showModal();
}


function initDialogs()
{
  $(".msgbox-error-icon").attr("os", gOS);
  
  gNewFolderDlg = new aeDialog("#new-folder-dlg");
  gNewFolderDlg.setProps({
    fldrTree: null,
    selectedFldrNode: null,
  });

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
    let fldrPickerMnuBtn = $("#new-folder-dlg-fldr-picker-mnubtn");
    let fldrPickerPopup = $("#new-folder-dlg-fldr-tree-popup");

    fldrPickerMnuBtn.click(aEvent => {
      if (fldrPickerPopup.css("visibility") == "visible") {
        fldrPickerPopup.css({ visibility: "hidden" });
        $("#new-folder-dlg-fldr-tree-popup-bkgrd-ovl").hide();
      }
      else {
        fldrPickerPopup.css({ visibility: "visible" });
        $("#new-folder-dlg-fldr-tree-popup-bkgrd-ovl").show();
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
    let rootFldrName = browser.i18n.getMessage("rootFldrName");
    let rootFldrCls = aeFolderPicker.ROOT_FOLDER_CLS;
    
    if (gPrefs.syncClippings) {
      if (gPrefs.newClippingSyncFldrsOnly) {
        rootFldrID = gPrefs.syncFolderID;
        rootFldrName = browser.i18n.getMessage("syncFldrName");
        rootFldrCls = aeFolderPicker.SYNCED_ROOT_FOLDER_CLS;
      }
      else if (gPrefs.cxtMenuSyncItemsOnly) {
        $("#new-folder-dlg-fldr-tree").addClass("show-sync-items-only");
      }
    }
    
    this.fldrTree = new aeFolderPicker(
      "#new-folder-dlg-fldr-tree",
      gClippingsDB,
      rootFldrID,
      rootFldrName,
      rootFldrCls,
      selectedFldrID
    );

    this.fldrTree.onSelectFolder = aFolderData => {
      this.selectedFldrNode = aFolderData.node;

      let fldrID = aFolderData.node.key;
      fldrPickerMnuBtn.val(fldrID).text(aFolderData.node.title);

      if (fldrID == gPrefs.syncFolderID) {
        fldrPickerMnuBtn.attr("syncfldr", "true");
      }
      else {
        fldrPickerMnuBtn.removeAttr("syncfldr");
      }
      
      fldrPickerPopup.css({ visibility: "hidden" });
      $("#new-folder-dlg-fldr-tree-popup-bkgrd-ovl").hide();
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

    gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
      gClippingsDB.folders.where("parentFolderID").equals(parentFldrID).count().then(aNumFldrs => {
        numItemsInParent += aNumFldrs;
        return gClippingsDB.clippings.where("parentFolderID").equals(parentFldrID).count();
        
      }).then(aNumClippings => {
        numItemsInParent += aNumClippings;
        newFolder.displayOrder = numItemsInParent;
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
        gParentFolderID = aFldrID;
        
        this.resetTree();

        let clipgsLstrs = gClippings.getClippingsListeners();
        clipgsLstrs.forEach(aListener => {
          aListener.newFolderCreated(aFldrID, newFolder, aeConst.ORIGIN_HOSTAPP);
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
}


function initFolderPicker()
{
  function selectSyncedClippingsFldr()
  {
    $("#new-clipping-fldr-picker-menubtn").val(gPrefs.syncFolderID)
      .text(browser.i18n.getMessage("syncFldrName"))
      .attr("syncfldr", "true");
  }
  
  // Initialize the transparent background that user can click on to dismiss an
  // open folder picker popup.
  $(".popup-bkgrd").click(aEvent => {
    $(".folder-tree-popup").css({ visibility: "hidden" });
    $(".popup-bkgrd").hide();
  });

  // Initialize the folder picker in the main New Clipping dialog.
  $("#new-clipping-fldr-picker-menubtn").click(aEvent => {
    let popup = $("#new-clipping-fldr-tree-popup");

    if (popup.css("visibility") == "hidden") {
      popup.css({ visibility: "visible" });
      $(".popup-bkgrd").show();
    }
    else {
      popup.css({ visibility: "hidden" });
      $(".popup-bkgrd").hide();
    }
  });

  // Set the width of the folder picker drop-down to match the width of the menu
  // button that opens it.
  let menuBtnStyle = window.getComputedStyle($("#new-clipping-fldr-picker-menubtn")[0]);
  let menuBtnWidth = parseInt(menuBtnStyle.width);
  
  // Need to add 1px to the popup width to compensate for having to add 1 pixel
  // to the width of the New Clipping popup window.
  $("#new-clipping-fldr-tree-popup").css({ width: `${menuBtnWidth + 1}px` });
  
  $("#new-folder-btn").attr("title", messenger.i18n.getMessage("btnNewFolder"));

  let rootFldrID = aeConst.ROOT_FOLDER_ID;
  let rootFldrName = browser.i18n.getMessage("rootFldrName");
  let rootFldrCls = aeFolderPicker.ROOT_FOLDER_CLS;
  let selectedFldrID = aeConst.ROOT_FOLDER_ID;

  if (gPrefs.syncClippings) {
    if (gPrefs.newClippingSyncFldrsOnly) {
      selectSyncedClippingsFldr();
      rootFldrID = gPrefs.syncFolderID;
      rootFldrName = browser.i18n.getMessage("syncFldrName");
      rootFldrCls = aeFolderPicker.SYNCED_ROOT_FOLDER_CLS;
    }
    else if (gPrefs.cxtMenuSyncItemsOnly) {
      selectSyncedClippingsFldr();
      $("#new-clipping-fldr-tree").addClass("show-sync-items-only");
      selectedFldrID = gPrefs.syncFolderID;
    }
  }
  
  gFolderPickerPopup = new aeFolderPicker(
    "#new-clipping-fldr-tree",
    gClippingsDB,
    rootFldrID,
    rootFldrName,
    rootFldrCls,
    selectedFldrID
  );

  gFolderPickerPopup.onSelectFolder = selectFolder;
}


function selectFolder(aFolderData)
{
  gParentFolderID = Number(aFolderData.node.key);
  
  let fldrPickerMenuBtn = $("#new-clipping-fldr-picker-menubtn");
  fldrPickerMenuBtn.text(aFolderData.node.title).val(gParentFolderID);

  if (gParentFolderID == gPrefs.syncFolderID) {
    fldrPickerMenuBtn.attr("syncfldr", "true");
  }
  else {
    fldrPickerMenuBtn.removeAttr("syncfldr");
  }
  
  $("#new-clipping-fldr-tree-popup").css({ visibility: "hidden" });
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
  $("#shct-key-tooltip").attr("title", tooltip);
}


function initLabelPicker()
{
  $("#clipping-label-picker").on("change", aEvent => {
    let label = aEvent.target.value;
    let color = label;

    if (! label) {
      color = "var(--color-default-text)";
    }
    else if (label == "yellow") {
      color = "rgb(200, 200, 0)";
    }
    $(aEvent.target).css({ color });
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


function accept(aEvent)
{
  let prefs = gClippings.getPrefs();
  
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

  gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
    gClippingsDB.folders.where("parentFolderID").equals(gParentFolderID).count().then(aNumFldrs => {
      numItemsInParent += aNumFldrs;
      return gClippingsDB.clippings.where("parentFolderID").equals(gParentFolderID).count();

    }).then(aNumClippings => {
      numItemsInParent += aNumClippings;
      newClipping.displayOrder = numItemsInParent;
      return gClippingsDB.clippings.add(newClipping);

    }).then(aNewClippingID => {
      let clipgsLstrs = gClippings.getClippingsListeners();
      clipgsLstrs.forEach(aListener => {
        aListener.newClippingCreated(aNewClippingID, newClipping, aeConst.ORIGIN_HOSTAPP);
      });

      return unsetClippingsUnchangedFlag();

    }).then(() => {
      if (gPrefs.syncClippings) {
        aeImportExport.setDatabase(gClippingsDB);
        
        return aeImportExport.exportToJSON(true, true, gPrefs.syncFolderID, false, true);
      }
      return null;

    }).then(aSyncData => {
      if (aSyncData) {
        let msg = {
          msgID: "set-synced-clippings",
          syncData: aSyncData.userClippingsRoot,
        };

        log("Clippings/mx::new.js: accept(): Sending message 'set-synced-clippings' to the Sync Clippings helper app.  Message data:");
        log(msg);
        
        return messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
      }
      return null;

    }).then(async (aMsgResult) => {
      if (aMsgResult) {
        log("Clippings/mx::new.js: accept(): Response from the Sync Clippings helper app:");
        log(aMsgResult);
      }

      if (gPrefs.clippingsMgrAutoShowDetailsPane && isClippingOptionsSet()) {
        aePrefs.setPrefs({
          clippingsMgrAutoShowDetailsPane: false,
          clippingsMgrDetailsPane: true,
        });
      }

      closeDlg();
      
    }).catch("OpenFailedError", aErr => {
      // OpenFailedError exception thrown if Firefox is set to "Never remember
      // history."
      errorMsgBox.onInit = () => {
        console.error(`Error creating clipping: ${aErr}`);
        let errMsgElt = $("#create-clipping-error-msgbox > .dlg-content > .msgbox-error-msg");
        errMsgElt.text(messenger.i18n.getMessage("saveClippingError"));
      };
      errorMsgBox.showModal();

    }).catch(aErr => {
      console.error("Clippings/mx::new.js: accept(): " + aErr);     
      errorMsgBox.onInit = () => {
        let errMsgElt = $("#create-clipping-error-msgbox > .dlg-content > .msgbox-error-msg");
        let errText = `Error creating clipping: ${aErr}`;

        if (aErr == aeConst.SYNC_ERROR_CONXN_FAILED) {
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


function cancel(aEvent)
{
  closeDlg();
}


async function closeDlg()
{
  await messenger.runtime.sendMessage({ msgID: "close-new-clipping-dlg" });
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
