/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gClippings;
let gDialogs = {};
let gIsActivatingSyncClippings = false;


// DOM utility
function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, { SAFE_FOR_JQUERY: true });
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
  let os = gClippings.getOS();
  document.body.dataset.os = os;

  // Sync Clippings is only supported on Windows.
  if (os == "win") {
    $("#sync-options").attr("data-visible", "true");
    $("#about-dlg").attr("data-show-sync-status", "true");
  }

  let keyCtrl  = messenger.i18n.getMessage("keyCtrl");
  let keyAlt   = messenger.i18n.getMessage("keyAlt");
  let keyShift = messenger.i18n.getMessage("keyShift");
  let shctModeKeys = `${keyCtrl}+${keyAlt}+V`;
  let shctModeKeysNew = `${keyAlt}+${keyShift}+Y`;
  
  if (os == "mac") {
    let keyOption = messenger.i18n.getMessage("keyOption");
    let keyCmd = messenger.i18n.getMessage("keyCommand");
    shctModeKeys = `${keyOption}${keyCmd}V`;
    
    // Cannot use Cmd+Shift+Y - already assigned to a composer command.
    $("#shortcut-key-new").css({ display: "none" });
    $("#shct-new-label").css({ display: "none" });
  }

  $("#shct-label").text(messenger.i18n.getMessage("prefsShctMode", shctModeKeys));
  $("#shct-new-label").text(messenger.i18n.getMessage("prefsShctModeNew", shctModeKeysNew));

  let prefs = gClippings.getPrefs();

  if (! prefs.keyboardPaste) {
    $("#shortcut-key-new").prop("disabled", true);
    $("#shct-new-label").attr("disabled", true);
  }

  $("#sync-intro").html(sanitizeHTML(messenger.i18n.getMessage("syncIntroTB")));

  initDialogs();

  $("#toggle-sync").click(async (aEvent) => {
    if (prefs.syncClippings) {
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
    setPref({ htmlPaste: aEvent.target.value });
  });

  $("#html-auto-line-break").attr("checked", prefs.autoLineBreak).click(aEvent => {
    setPref({ autoLineBreak: aEvent.target.checked });
  });

  $("#shortcut-key").attr("checked", prefs.keyboardPaste).click(aEvent => {
    let shortcutCb = aEvent.target;
    setPref({ keyboardPaste: shortcutCb.checked });

    if (os != "mac") {
      $("#shortcut-key-new").prop("disabled", !shortcutCb.checked);
      $("#shct-new-label").attr("disabled", !shortcutCb.checked);

      if (! shortcutCb.checked) {
        $("#shortcut-key-new").prop("checked", false);
        setPref({ wxPastePrefixKey: false });
      }
    }
  });

  $("#shortcut-key-new").attr("checked", prefs.wxPastePrefixKey).click(aEvent => {
    setPref({ wxPastePrefixKey: aEvent.target.checked });
  });

  $("#auto-inc-plchldrs-start-val").val(prefs.autoIncrPlchldrStartVal).click(aEvent => {
    setPref({ autoIncrPlchldrStartVal: aEvent.target.valueAsNumber });
  });

  $("#check-spelling").attr("checked", prefs.checkSpelling).click(aEvent => {
    setPref({ checkSpelling: aEvent.target.checked });
  });

  $("#backup-filename-with-date").attr("checked", prefs.backupFilenameWithDate).click(aEvent => {
    setPref({ backupFilenameWithDate: aEvent.target.checked });
  });

  $("#backup-reminder").prop("checked", (prefs.backupRemFrequency != aeConst.BACKUP_REMIND_NEVER)).click(async (aEvent) => {
    if (aEvent.target.checked) {
      $("#backup-reminder-freq").prop("disabled", false);
      setPref({
        backupRemFrequency: Number($("#backup-reminder-freq").val()),
        backupRemFirstRun: false,
        lastBackupRemDate: new Date().toString(),
      });
    }
    else {
      $("#backup-reminder-freq").prop("disabled", true);
      setPref({ backupRemFrequency: aeConst.BACKUP_REMIND_NEVER });
    }

    gClippings.clearBackupNotificationInterval();
    if (aEvent.target.checked) {
      gClippings.setBackupNotificationInterval();
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
    setPref({
      backupRemFrequency: Number(aEvent.target.value),
      backupRemFirstRun: false,
      lastBackupRemDate: new Date().toString(),
    });

    gClippings.clearBackupNotificationInterval();
    gClippings.setBackupNotificationInterval();
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
    gotoURL(aEvent.target.href);
  });
}


function setPref(aPref)
{
  messenger.storage.local.set(aPref);
}


function initDialogs()
{
  let osName = gClippings.getOS();
  $(".msgbox-icon").attr("os", osName);
  
  gDialogs.syncClippings = new aeDialog("#sync-clippings-dlg");
  gDialogs.syncClippings.oldShowSyncItemsOpt = null;
  gDialogs.syncClippings.isCanceled = false;
  gDialogs.syncClippings.onInit = () => {
    gDialogs.syncClippings.isCanceled = false;
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

    let lang = messenger.i18n.getUILanguage();
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      console.info("Sync Clippings helper app version: " + aResp.appVersion);

      let prefs = gClippings.getPrefs();
      
      $("#sync-helper-app-update-check").prop("checked", prefs.syncHelperCheckUpdates);
      $("#show-only-sync-items").prop("checked", prefs.cxtMenuSyncItemsOnly);

      gDialogs.syncClippings.oldShowSyncItemsOpt = $("#show-only-sync-items").prop("checked");

      if (lang == "de") {
        $("#sync-helper-app-update-check + label").css({ letterSpacing: "-0.51px" });
      }
      else if (lang == "pt-BR") {
        $("#sync-helper-app-update-check + label").css({ letterSpacing: "-0.56px" });
      }

      let msg = { msgID: "get-sync-dir" };
      return messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
      
    }).then(aResp => {
      if (! gDialogs.syncClippings.isCanceled) {
        $("#sync-clippings-dlg").css({ height: "336px" });

        if (lang == "es-ES") {
          $("#sync-clippings-dlg").css({ width: "606px" });
          $("#sync-helper-app-update-check + label").css({ letterSpacing: "-0.56px" });
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
  gDialogs.syncClippings.onAccept = () => {
    let that = gDialogs.syncClippings;

    let syncFldrPath = $("#sync-fldr-curr-location").val();

    // Sanitize the sync folder path value.
    syncFldrPath = syncFldrPath.trim();
    syncFldrPath = syncFldrPath.replace(/\"/g, "");
    
    if (! syncFldrPath) {
      $("#sync-fldr-curr-location").focus();
      return;
    }

    setPref({
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
    setSyncFilePath.then(aResp => {
      log("Received response to 'set-sync-dir':");
      log(aResp);

      if (aResp.status == "ok") {
        gClippings.enableSyncClippings(true).then(aSyncFldrID => {
	  if (gIsActivatingSyncClippings) {
            // Don't do the following if Sync Clippings was already turned on
            // and no changes to settings were made.
            setPref({
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
  gDialogs.syncClippings.onUnload = () => {
    $("#sync-clippings-dlg").css({ height: "256px" });
    gDialogs.syncClippings.isCanceled = true;
  };

  // Dialog UI strings
  if (osName == "win") {
    $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExWin"));
  }
  else if (osName == "mac") {
    $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExMac"));
  }
  else {
    $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExLinux"));
  }
  $("#sync-conxn-error-detail").html(sanitizeHTML(messenger.i18n.getMessage("errSyncConxnDetail")));

  gDialogs.turnOffSync = new aeDialog("#turn-off-sync-clippings-dlg");
  $("#turn-off-sync-clippings-dlg > .dlg-btns > .dlg-btn-yes").click(aEvent => {
    let that = gDialogs.turnOffSync;
    that.close();

    gClippings.enableSyncClippings(false).then(aOldSyncFldrID => {
      setPref({ syncClippings: false });
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
  gDialogs.turnOffSyncAck.oldSyncFldrID = null;
  gDialogs.turnOffSyncAck.onInit = () => {
    $("#delete-sync-fldr").prop("checked", true);
  };
  gDialogs.turnOffSyncAck.onAfterAccept = () => {
    let that = gDialogs.turnOffSyncAck;
    let removeSyncFldr = $("#delete-sync-fldr").prop("checked");
    let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();

    for (let listener of syncClippingsListeners) {
      listener.onAfterDeactivate(removeSyncFldr, that.oldSyncFldrID);
    }
  };

  gDialogs.about = new aeDialog("#about-dlg");
  gDialogs.about.extInfo = null;
  gDialogs.about.onInit = () => {
    let that = gDialogs.about;
    
    let diagDeck = $("#about-dlg > .dlg-content #diag-info .deck");
    diagDeck.children("#sync-diag-loading").show();
    diagDeck.children("#sync-diag").hide();
    $("#about-dlg > .dlg-content #diag-info #sync-diag-detail").hide();
    $("#about-dlg > .dlg-content #diag-info #sync-file-size").text("");

    if (! that.extInfo) {
      let extManifest = messenger.runtime.getManifest();
      that.extInfo = {
        name: extManifest.name,
        version: extManifest.version,
        description: extManifest.description,
        homePgURL: extManifest.homepage_url,
      };
    }

    $("#about-dlg > .dlg-content #ext-name").text(that.extInfo.name);
    $("#about-dlg > .dlg-content #ext-ver").text(messenger.i18n.getMessage("aboutExtVer", that.extInfo.version));
    $("#about-dlg > .dlg-content #ext-desc").text(that.extInfo.description);
    $("#about-dlg > .dlg-content #ext-home-pg").attr("href", that.extInfo.homePgURL);

    let lang = messenger.i18n.getUILanguage();
    if (lang == "de") {
      $("#usr-contrib-cta").css({ letterSpacing: "-0.1px" });
    }
    else if (lang == "pt-BR") {
      $("#ext-desc").css({ letterSpacing: "-0.55px" });
    }
    else if (lang == "es-ES") {
      $("#sync-ver-label").css({ letterSpacing: "-0.15px" });
    }
  };
  gDialogs.about.onShow = () => {
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      $("#about-dlg > .dlg-content #diag-info #sync-ver").text(aResp.appVersion);     

      let prefs = gClippings.getPrefs();

      if (prefs.syncClippings) {
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

  // Sync Clippings help dialog content.
  $("#sync-clippings-help-dlg > .dlg-content").html(sanitizeHTML(messenger.i18n.getMessage("syncHelp")));
}


// Handling keyboard events in open modal dialogs.
$(window).keydown(aEvent => {
  function isAccelKeyPressed()
  {
    let rv;
    let os = gClippings.getOS();
    if (os == "mac") {
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


function gotoURL(aURL)
{
  messenger.tabs.create({ url: aURL });
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
