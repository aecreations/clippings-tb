/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gClippings;
let gOS;
let gDialogs = {};
let gIsActivatingSyncClippings = false;


// DOM utility
function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, { SAFE_FOR_JQUERY: true });
}


function capitalize(aString)
{
  let rv;

  if (typeof aString != "string") {
    throw new TypeError("Not a string");
  }
  else if (! aString) {
    rv = "";
  }
  else if (aString.length == 1) {
    rv = aString.toUpperCase();
  }
  else {
    rv = aString[0].toUpperCase().concat(aString.substring(1));
  }

  return rv;
}


// Options page initialization
$(async () => {
  gClippings = await messenger.runtime.getBackgroundPage();

  if (! gClippings) {
    // Hide the broken "Turn Off Sync" button when Private Browsing turned on.
    $("#toggle-sync").hide();
    
    window.alert(messenger.i18n.getMessage("errPrefPgFailed"));
    await closePage();
    return;
  }

  window.focus();
  init();
});


async function init()
{
  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = gOS = platform.os;

  let keyCtrl  = messenger.i18n.getMessage("keyCtrl");
  let keyAlt   = messenger.i18n.getMessage("keyAlt");
  let keyShift = messenger.i18n.getMessage("keyShift");
  let shctModeKeys = `${keyCtrl}+${keyAlt}+V`;
  let shctModeKeysNew = `${keyAlt}+${keyShift}+Y`;
  
  if (gOS == "win") {
    // Cannot use Ctrl+Alt+V - already assigned to a global shortcut for
    // inserting the radical symbol (√) on Windows 10
    $("#shortcut-key").css({ display: "none" });
    $("#shct-label").css({ display: "none" });
    $("#row-shct-key-new").removeClass("indent");
  }
  else if (gOS == "mac") {
    let keyOption = messenger.i18n.getMessage("keyOption");
    let keyCmd = messenger.i18n.getMessage("keyCommand");
    shctModeKeys = `${keyOption}${keyCmd}V`;
    
    // Cannot use Cmd+Shift+Y - already assigned to a composer command.
    $("#shortcut-key-new").css({ display: "none" });
    $("#shct-new-label").css({ display: "none" });
  }

  $("#shct-label").text(messenger.i18n.getMessage("prefsShctMode", shctModeKeys));

  let shctNewLabelTxt = messenger.i18n.getMessage("prefsShctModeNew", shctModeKeysNew);
  if (gOS == "win") {
    shctNewLabelTxt = messenger.i18n.getMessage("prefsShctMode", shctModeKeysNew);
  }
  $("#shct-new-label").text(shctNewLabelTxt);

  let prefs = await aePrefs.getAllPrefs();

  if (! prefs.keyboardPaste) {
    $("#shortcut-key-new").prop("disabled", true);
    $("#shct-new-label").attr("disabled", true);
  }

  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;
  document.body.dataset.laf = prefs.enhancedLaF;

  $("#sync-intro").html(sanitizeHTML(messenger.i18n.getMessage("syncIntroTB")));

  initDialogs();

  $("#toggle-sync").click(async (aEvent) => {
    let syncClippings = await aePrefs.getPref("syncClippings");
    if (syncClippings) {
      gDialogs.turnOffSync.showModal();
    }
    else {
      gIsActivatingSyncClippings = true;
      gDialogs.syncClippings.showModal();
    }
  });

  $("#about-btn").click(aEvent => {
    gDialogs.about.showModal();
  });

  let usrContribCTA = $("#usr-contrib-cta");
  usrContribCTA.append(sanitizeHTML(`<label id="usr-contrib-cta-hdg">${messenger.i18n.getMessage("aboutContribHdg")}</label>&nbsp;`));
  usrContribCTA.append(sanitizeHTML(`<a href="${aeConst.DONATE_URL}" class="hyperlink">${messenger.i18n.getMessage("aboutDonate")}</a>&nbsp;`));
  usrContribCTA.append(sanitizeHTML(`<label id="usr-contrib-cta-conj">${messenger.i18n.getMessage("aboutContribConj")}</label>`));
  usrContribCTA.append(sanitizeHTML(`<a href="${aeConst.L10N_URL}" class="hyperlink">${messenger.i18n.getMessage("aboutL10n")}</a>`));
  
  $("#html-paste-options").val(prefs.htmlPaste).change(aEvent => {
    aePrefs.setPrefs({ htmlPaste: aEvent.target.value });
  });

  $("#html-auto-line-break").attr("checked", prefs.autoLineBreak).click(aEvent => {
    aePrefs.setPrefs({ autoLineBreak: aEvent.target.checked });
  });

  $("#shortcut-key").attr("checked", prefs.keyboardPaste).click(aEvent => {
    let shortcutCb = aEvent.target;
    aePrefs.setPrefs({ keyboardPaste: shortcutCb.checked });

    if (gOS != "mac") {
      $("#shortcut-key-new").prop("disabled", !shortcutCb.checked);
      $("#shct-new-label").attr("disabled", !shortcutCb.checked);

      if (! shortcutCb.checked) {
        $("#shortcut-key-new").prop("checked", false);
        aePrefs.setPrefs({ wxPastePrefixKey: false });
      }
    }
  });

  $("#shortcut-key-new").attr("checked", prefs.wxPastePrefixKey).click(aEvent => {
    aePrefs.setPrefs({ wxPastePrefixKey: aEvent.target.checked });
  });

  $("#auto-inc-plchldrs-start-val").val(prefs.autoIncrPlchldrStartVal).click(aEvent => {
    aePrefs.setPrefs({ autoIncrPlchldrStartVal: aEvent.target.valueAsNumber });
  });

  $("#check-spelling").attr("checked", prefs.checkSpelling).click(aEvent => {
    aePrefs.setPrefs({ checkSpelling: aEvent.target.checked });
  });

  $("#backup-filename-with-date").attr("checked", prefs.backupFilenameWithDate).click(aEvent => {
    aePrefs.setPrefs({ backupFilenameWithDate: aEvent.target.checked });
  });

  $("#backup-reminder").attr("checked", (prefs.backupRemFrequency != aeConst.BACKUP_REMIND_NEVER)).click(async (aEvent) => {
    if (aEvent.target.checked) {
      $("#backup-reminder-freq").prop("disabled", false);
      $("#skip-backup-if-no-chg").prop("disabled", false);
      $("#skip-backup-label").removeAttr("disabled");
      aePrefs.setPrefs({
        backupRemFrequency: Number($("#backup-reminder-freq").val()),
        backupRemFirstRun: false,
        lastBackupRemDate: new Date().toString(),
      });
    }
    else {
      $("#backup-reminder-freq").prop("disabled", true);
      $("#skip-backup-if-no-chg").prop("disabled", true);
      $("#skip-backup-label").attr("disabled", true);
      aePrefs.setPrefs({ backupRemFrequency: aeConst.BACKUP_REMIND_NEVER });
    }

    await messenger.runtime.sendMessage({msgID: "clear-backup-notifcn-intv"});
    if (aEvent.target.checked) {
      messenger.runtime.sendMessage({msgID: "set-backup-notifcn-intv"});
    }
  });

  if (prefs.backupRemFrequency == aeConst.BACKUP_REMIND_NEVER) {
    // Set to default interval.
    $("#backup-reminder-freq").val(aeConst.BACKUP_REMIND_WEEKLY).prop("disabled", true);
  }
  else {
    $("#backup-reminder-freq").val(prefs.backupRemFrequency);
  }
  
  $("#backup-reminder-freq").change(async (aEvent) => {
    aePrefs.setPrefs({
      backupRemFrequency: Number(aEvent.target.value),
      backupRemFirstRun: false,
      lastBackupRemDate: new Date().toString(),
    });

    await messenger.runtime.sendMessage({msgID: "clear-backup-notifcn-intv"});
    messenger.runtime.sendMessage({msgID: "set-backup-notifcn-intv"});
  });

  $("#skip-backup-if-no-chg").attr("checked", prefs.skipBackupRemIfUnchg).click(aEvent => {
    aePrefs.setPrefs({skipBackupRemIfUnchg: aEvent.target.checked});
  });

  $("#wnds-dlgs-settings").on("click", aEvent => {
    gDialogs.wndsDlgsOpts.showModal();
  });

  if (prefs.syncClippings) {
    $("#sync-settings").show();
    $("#sync-status").addClass("sync-status-on").text(messenger.i18n.getMessage("syncStatusOn"));
    $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOff"));
  }
  else {
    $("#sync-settings").hide();
    $("#sync-status").text(messenger.i18n.getMessage("syncStatusOff"));
    $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOn"));
  }

  $("#sync-settings").click(aEvent => {
    gDialogs.syncClippings.showModal();
  });
  
  $("#show-sync-help").click(aEvent => {
    gDialogs.syncClippingsHelp.showModal();
  });

  $(".hyperlink").click(aEvent => {
    aEvent.preventDefault();
    gotoURL(aEvent.target.href, ("openInTbWnd" in aEvent.target.dataset));
  });
}


function initDialogs()
{
  $(".msgbox-icon").attr("os", gOS);
  
  gDialogs.wndsDlgsOpts = new aeDialog("#wnds-dlgs-opts-dlg");
  gDialogs.wndsDlgsOpts.setProps({
    resetClpMgrWndPos: false,
  });
  gDialogs.wndsDlgsOpts.onFirstInit = function ()
  {   
    if (gOS != "win") {
      let os = gOS == "mac" ? "macOS" : capitalize(gOS);
      $("#wnds-dlgs-opts-dlg").css({height: "320px"});
      $("#wnds-dlgs-opts-exp-warn-msg").text(browser.i18n.getMessage("wndsDlgsOptsExpWarn", os));
      $("#wnds-dlgs-opts-exp-warn").show();
    }

    $("#clpmgr-save-wnd-pos").on("click", aEvent => {
      $("#reset-clpmgr-wnd-pos").prop("disabled", !aEvent.target.checked);
    });

    $("#reset-clpmgr-wnd-pos").on("click", aEvent => {
      this.resetClpMgrWndPos = true;
    });
  };
  gDialogs.wndsDlgsOpts.onInit = async function ()
  {
    let prefs = await aePrefs.getAllPrefs();
    $("#auto-pos-wnds").prop("checked", prefs.autoAdjustWndPos);
    $("#clpmgr-save-wnd-pos").prop("checked", prefs.clippingsMgrSaveWndGeom);
    $("#reset-clpmgr-wnd-pos").prop("disabled", !$("#clpmgr-save-wnd-pos").prop("checked"));
  };
  gDialogs.wndsDlgsOpts.onAccept = async function (aEvent)
  {
    let autoAdjustWndPos = $("#auto-pos-wnds").prop("checked");
    let clippingsMgrSaveWndGeom = $("#clpmgr-save-wnd-pos").prop("checked");
    await aePrefs.setPrefs({autoAdjustWndPos, clippingsMgrSaveWndGeom});

    let isClippingsMgrOpen;
    try {
      isClippingsMgrOpen = await browser.runtime.sendMessage({msgID: "ping-clippings-mgr"});
    }
    catch (e) {}

    if (isClippingsMgrOpen) {
      let saveWndGeom = this.resetClpMgrWndPos ? false : clippingsMgrSaveWndGeom;
      await browser.runtime.sendMessage({
        msgID: "toggle-save-clipman-wnd-geom",
        saveWndGeom,
      });

      if (! saveWndGeom) {
        await this._purgeSavedClpMgrWndGeom();
      }
    }
    else {
      if (this.resetClpMgrWndPos || !clippingsMgrSaveWndGeom) {
        await this._purgeSavedClpMgrWndGeom();
      }
    }

    this.close();
  };
  gDialogs.wndsDlgsOpts._purgeSavedClpMgrWndGeom = async function ()
  {   
    await aePrefs.setPrefs({
      clippingsMgrWndGeom: null,
      clippingsMgrTreeWidth: null,
    });
  };
  gDialogs.wndsDlgsOpts.onUnload = function ()
  {
    this.resetClpMgrWndPos = false;
    $("#reset-clpmgr-wnd-pos").prop("disabled", false);
  };

  gDialogs.syncClippings = new aeDialog("#sync-clippings-dlg");
  gDialogs.syncClippings.setProps({
    oldShowSyncItemsOpt: null,
    isCanceled: false,
  });
  gDialogs.syncClippings.onFirstInit = function ()
  {
    if (gOS == "win") {
      $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExWin"));
    }
    else if (gOS == "mac") {
      $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExMac"));
    }
    else {
      $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExLinux"));
    }
    $("#sync-conxn-error-detail").html(sanitizeHTML(messenger.i18n.getMessage("errSyncConxnDetail")));
  };
  gDialogs.syncClippings.onInit = function ()
  {
    this.isCanceled = false;
    $("#sync-clippings-dlg .dlg-accept").hide();
    $("#sync-clippings-dlg .dlg-cancel").text(messenger.i18n.getMessage("btnCancel"));
    $("#sync-err-detail").text("");
    
    let deckSyncChk = $("#sync-connection-check");
    let deckSyncConxnError = $("#sync-cxn-error");
    let deckSyncError = $("#generic-error");
    let deckSyncSettings = $("#sync-folder-location");

    deckSyncChk.show();
    deckSyncConxnError.hide();
    deckSyncError.hide();
    deckSyncSettings.hide();

    let that = this;
    let lang = messenger.i18n.getUILanguage();
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      console.info("Sync Clippings helper app version: " + aResp.appVersion);
      return aePrefs.getAllPrefs();

    }).then(aPrefs => {
      $("#sync-helper-app-update-check").prop("checked", aPrefs.syncHelperCheckUpdates);
      $("#show-only-sync-items").prop("checked", aPrefs.cxtMenuSyncItemsOnly);

      that.oldShowSyncItemsOpt = $("#show-only-sync-items").prop("checked");

      let msg = { msgID: "get-sync-dir" };
      return messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
      
    }).then(aResp => {
      if (! that.isCanceled) {
        if (lang == "es-ES") {
          $("#sync-clippings-dlg").css({ width: "606px" });
        }
      }
      $("#sync-clippings-dlg .dlg-accept").show();
      $("#sync-clippings-dlg .dlg-cancel").text(messenger.i18n.getMessage("btnCancel"));

      deckSyncChk.hide();
      deckSyncSettings.show();
      $("#sync-fldr-curr-location").val(aResp.syncFilePath).focus().select();

    }).catch(aErr => {
      console.error("Clippings/wx::options.js: Error returned from syncClippings native app: " + aErr);
      
      $("#sync-clippings-dlg .dlg-cancel").text(messenger.i18n.getMessage("btnClose"));

      if (aErr == aeConst.SYNC_ERROR_CONXN_FAILED) {
        // This would occur if Sync Clippings helper app won't start.
        deckSyncChk.hide();
        deckSyncConxnError.show();
      }
      else if (aErr == aeConst.SYNC_ERROR_UNKNOWN) {
        deckSyncChk.hide();
        deckSyncSettings.hide();
        deckSyncError.show();
        $("#sync-err-detail").text(messenger.i18n.getMessage("errNoDetails"));
      }
      else {
        deckSyncChk.hide();
        deckSyncSettings.hide();
        deckSyncError.show();
        $("#sync-err-detail").text(messenger.i18n.getMessage("errSyncOptsInit"));
      }
    });
  };
  gDialogs.syncClippings.onAccept = function ()
  {
    let syncFldrPath = $("#sync-fldr-curr-location").val();

    // Sanitize the sync folder path value.
    syncFldrPath = syncFldrPath.trim();
    syncFldrPath = syncFldrPath.replace(/\"/g, "");
    
    if (! syncFldrPath) {
      $("#sync-fldr-curr-location").focus();
      return;
    }

    aePrefs.setPrefs({
      syncHelperCheckUpdates: $("#sync-helper-app-update-check").prop("checked"),
      cxtMenuSyncItemsOnly: $("#show-only-sync-items").prop("checked"),
    });

    let rebuildClippingsMenu = $("#show-only-sync-items").prop("checked") != gDialogs.syncClippings.oldShowSyncItemsOpt;

    let msg = {
      msgID: "set-sync-dir",
      filePath: syncFldrPath
    };
    log("Sending message 'set-sync-dir' with params:");
    log(msg);

    let setSyncFilePath = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    let that = this;
    
    setSyncFilePath.then(aResp => {
      log("Received response to 'set-sync-dir':");
      log(aResp);

      if (aResp.status == "ok") {
        gClippings.enableSyncClippings(true).then(aSyncFldrID => {
	  if (gIsActivatingSyncClippings) {
            // Don't do the following if Sync Clippings was already turned on
            // and no changes to settings were made.
            aePrefs.setPrefs({
              syncClippings: true,
              clippingsMgrShowSyncItemsOnlyRem: true,
            });

            $("#sync-settings").show();
            $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOff"));
            $("#sync-status").addClass("sync-status-on").text(messenger.i18n.getMessage("syncStatusOn"));

	    gIsActivatingSyncClippings = false;
	  }

          gClippings.refreshSyncedClippings(rebuildClippingsMenu);  // Asynchronous function.
          
	  let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();
	  for (let listener of syncClippingsListeners) {
	    listener.onActivate(aSyncFldrID);
	  }
	  
	  that.close();
        });
      }
      else {
        window.alert(`The Sync Clippings helper app responded with an error.\n\nStatus: ${aResp.status}\nDetails: ${aResp.details}`);
        that.close();
      }     
    }).catch(aErr => {
      console.error(aErr);
    });
  };
  gDialogs.syncClippings.onUnload = function ()
  {
    $("#sync-clippings-dlg").css({ height: "256px" });
    gDialogs.syncClippings.isCanceled = true;
  };
  
  gDialogs.turnOffSync = new aeDialog("#turn-off-sync-clippings-dlg");
  $("#turn-off-sync-clippings-dlg > .dlg-btns > .dlg-btn-yes").click(aEvent => {
    let that = gDialogs.turnOffSync;
    that.close();

    gClippings.enableSyncClippings(false).then(aOldSyncFldrID => {
      aePrefs.setPrefs({ syncClippings: false });
      $("#sync-settings").hide();
      $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOn"));
      $("#sync-status").removeClass("sync-status-on").text(messenger.i18n.getMessage("syncStatusOff"));

      let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();
      for (let listener of syncClippingsListeners) {
	listener.onDeactivate(aOldSyncFldrID);
      }

      gDialogs.turnOffSyncAck.oldSyncFldrID = aOldSyncFldrID;
      gDialogs.turnOffSyncAck.showModal();
    });
  });

  gDialogs.turnOffSyncAck = new aeDialog("#turn-off-sync-clippings-ack-dlg");
  gDialogs.turnOffSyncAck.setProps({
    oldSyncFldrID: null,
  });
  gDialogs.turnOffSyncAck.onInit = function ()
  {
    $("#delete-sync-fldr").prop("checked", true);
  };
  gDialogs.turnOffSyncAck.onAfterAccept = function ()
  {
    let removeSyncFldr = $("#delete-sync-fldr").prop("checked");
    let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();

    for (let listener of syncClippingsListeners) {
      listener.onAfterDeactivate(removeSyncFldr, this.oldSyncFldrID);
    }
  };

  gDialogs.about = new aeDialog("#about-dlg");
  gDialogs.about.setProps({
    extInfo: null,
  });
  gDialogs.about.onInit = function ()
  {
    let diagDeck = $("#about-dlg > .dlg-content #diag-info .deck");
    diagDeck.children("#sync-diag-loading").show();
    diagDeck.children("#sync-diag").hide();
    $("#about-dlg > .dlg-content #diag-info #sync-diag-detail").hide();
    $("#about-dlg > .dlg-content #diag-info #sync-file-size").text("");

    if (! this.extInfo) {
      let extManifest = messenger.runtime.getManifest();
      this.extInfo = {
        name: extManifest.name,
        version: extManifest.version,
        description: extManifest.description,
        homePgURL: extManifest.homepage_url,
      };
    }

    $("#about-dlg > .dlg-content #ext-name").text(this.extInfo.name);
    $("#about-dlg > .dlg-content #ext-ver").text(messenger.i18n.getMessage("aboutExtVer", this.extInfo.version));
    $("#about-dlg > .dlg-content #ext-desc").text(this.extInfo.description);
    $("#about-dlg > .dlg-content #ext-home-pg").attr("href", this.extInfo.homePgURL);
  };
  gDialogs.about.onShow = async function ()
  {
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      $("#about-dlg > .dlg-content #diag-info #sync-ver").text(aResp.appVersion);
      return aePrefs.getPref("syncClippings");

    }).then(aPrefSyncClpgs => {
      if (!!aPrefSyncClpgs) {
        let msg = { msgID: "get-sync-file-info" };
        return messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
      }
      else {
        return null;
      }
    }).then(aResp => {
      if (aResp) {
        let syncFileSize;
        if (aResp.fileSizeKB == "") {
          // Sync Clippings is turned on, but sync file is not yet created.
          syncFileSize = "-";
        }
        else {
          syncFileSize = `${aResp.fileSizeKB} KiB`;
        }
        $("#about-dlg > .dlg-content #diag-info #about-sync-status").hide();
        $("#about-dlg > .dlg-content #diag-info #sync-file-size-label").show();
        $("#about-dlg > .dlg-content #diag-info #sync-file-size").text(syncFileSize);
      }
      else {
        // Sync Clippings is inactive.
        $("#about-dlg > .dlg-content #diag-info #sync-file-size-label").hide();
        $("#about-dlg > .dlg-content #diag-info #about-sync-status").text(messenger.i18n.getMessage("syncStatusOff")).show();
      }
      
      $("#about-dlg > .dlg-content #diag-info #sync-diag-detail").show();

    }).catch(aErr => {
      // Native app is not installed.
      log("Clippings/wx: About dialog: Error returned from native app: " + aErr);
      $("#about-dlg > .dlg-content #diag-info #sync-ver").text(messenger.i18n.getMessage("noSyncHelperApp"));
      
    }).finally(() => {
      let diagDeck = $("#about-dlg > .dlg-content #diag-info .deck");
      diagDeck.children("#sync-diag-loading").hide();
      diagDeck.children("#sync-diag").show();
    });
  };
  
  gDialogs.syncClippingsHelp = new aeDialog("#sync-clippings-help-dlg");
  gDialogs.syncClippingsHelp.onFirstInit = function ()
  {
    // Sync Clippings help dialog content.
    $("#sync-clippings-help-dlg > .dlg-content").html(sanitizeHTML(messenger.i18n.getMessage("syncHelpTB")));
  };
}


// Handling keyboard events in open modal dialogs.
$(window).keydown(aEvent => {
  function isAccelKeyPressed()
  {
    let rv;
    if (gOS == "mac") {
      rv = aEvent.metaKey;
    }
    else {
      rv = aEvent.ctrlKey;
    }
    
    return rv;
  }

  function isTextboxFocused(aEvent)
  {
    return (aEvent.target.tagName == "INPUT" || aEvent.target.tagName == "TEXTAREA");
  }

  if (aEvent.key == "Enter" && aeDialog.isOpen()) {
    aeDialog.acceptDlgs();

    // Don't trigger any further actions that would have occurred if the
    // ENTER key was pressed.
    aEvent.preventDefault();
  }
  else if (aEvent.key == "Escape" && aeDialog.isOpen()) {
    aeDialog.cancelDlgs();
  }
  else if (aEvent.key == "/" || aEvent.key == "'") {
    if (! isTextboxFocused(aEvent)) {
      aEvent.preventDefault();  // Suppress quick find in page.
    }
  }
  else if (aEvent.key == "F5") {
    aEvent.preventDefault();  // Suppress browser reload.
  }
  else {
    // Ignore standard browser shortcut keys.
    let key = aEvent.key.toUpperCase();
    if (isAccelKeyPressed() && (key == "D" || key == "F" || key == "N" || key == "P"
                                || key == "R" || key == "S" || key == "U")) {
      aEvent.preventDefault();
    }
  }
});


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


messenger.runtime.onMessage.addListener(aRequest => {
  if (aRequest.msgID == "focus-extension-prefs-pg") {
    window.focus();
  }
});


function gotoURL(aURL, aOpenInTbWnd)
{
  if (aOpenInTbWnd) {
    messenger.tabs.create({ url: aURL });
  }
  else {
    try {
      // Requires Thunderbird 78.6.0 or newer
      messenger.windows.openDefaultBrowser(aURL);
    }
    catch (e) {
      messenger.tabs.create({ url: aURL });
    }
  }
}


async function closePage()
{
  let tab = await messenger.tabs.getCurrent();
  messenger.tabs.remove(tab.id);
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
