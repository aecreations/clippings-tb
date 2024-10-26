/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gBackupConfirmMsgBox;


// Dialog initialization
$(async () => {
  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = platform.os;
  aeInterxn.init(platform.os);

  // Reset backup notification interval timer so that it fires 24 hours after
  // displaying this first-time backup dialog.
  await messenger.runtime.sendMessage({msgID: "clear-backup-notifcn-intv"});
  messenger.runtime.sendMessage({msgID: "set-backup-notifcn-intv"});
  
  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;
  moment.locale(lang);

  $("#btn-accept").click(aEvent => { backup() });
  $("#btn-close").click(aEvent => { closeDlg() });

  let backupRemFrequency = await aePrefs.getPref("backupRemFrequency");
  $("#backup-reminder").prop("checked", (backupRemFrequency != aeConst.BACKUP_REMIND_NEVER)).click(aEvent => {
    let setPrefs;
    
    if (aEvent.target.checked) {
      $("#backup-reminder-freq").prop("disabled", false);
      setPrefs = aePrefs.setPrefs({
        backupRemFrequency: Number($("#backup-reminder-freq").val()),
        backupRemFirstRun: false,
        lastBackupRemDate: new Date().toString(),
      });
    }
    else {
      $("#backup-reminder-freq").prop("disabled", true);
      setPrefs = aePrefs.setPrefs({
	backupRemFrequency: aeConst.BACKUP_REMIND_NEVER,
      });
    }

    setPrefs.then(() => {
      return messenger.runtime.sendMessage({msgID: "clear-backup-notifcn-intv"});
    }).then(() => {
      if (aEvent.target.checked) {
	messenger.runtime.sendMessage({msgID: "set-backup-notifcn-intv"});
      }
    });
  });

  if (backupRemFrequency == aeConst.BACKUP_REMIND_NEVER) {
    // Set to default interval.
    $("#backup-reminder-freq").val(aeConst.BACKUP_REMIND_WEEKLY).prop("disabled", true);
  }
  else {
    $("#backup-reminder-freq").val(backupRemFrequency);
  }

  $("#backup-reminder-freq").change(async (aEvent) => {
    await aePrefs.setPrefs({
      backupRemFrequency: Number(aEvent.target.value),
      backupRemFirstRun: false,
      lastBackupRemDate: new Date().toString(),
    });
    await messenger.runtime.sendMessage({msgID: "clear-backup-notifcn-intv"});
    messenger.runtime.sendMessage({msgID: "set-backup-notifcn-intv"});
  });

  initDialogs();
  window.focus();

  let defDlgBtnFollowsFocus = await aePrefs.getPref("defDlgBtnFollowsFocus");
  if (defDlgBtnFollowsFocus) {
    aeInterxn.initDialogButtonFocusHandlers();
  }

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


function initDialogs()
{
  gBackupConfirmMsgBox = new aeDialog("#backup-confirm-msgbox");
  gBackupConfirmMsgBox.setMessage = function (aMessage)
  {
    $("#backup-confirm-msgbox > .msgbox-content").text(aMessage);
  };
}

async function backup()
{
  let backupJSON = await messenger.runtime.sendMessage({msgID: "get-clippings-backup-data"});

  if (! backupJSON) {
    window.alert("Clippings Error: Unable to get backup data.");
    return;
  }

  let filename = aeConst.CLIPPINGS_BACKUP_FILENAME;
  let backupFilenameWithDate = await aePrefs.getPref("backupFilenameWithDate");
  if (backupFilenameWithDate) {
    filename = aeConst.CLIPPINGS_BACKUP_FILENAME_WITH_DATE.replace("%s", moment().format("YYYY-MM-DD"));
  }

  let blobData = new Blob([backupJSON], { type: "application/json;charset=utf-8"});
  let downldOpts = {
    url: URL.createObjectURL(blobData),
    filename,
    saveAs: true,
  };
  
  let downldItemID, downldItems;
  try {
    downldItemID = await messenger.downloads.download(downldOpts);
    downldItems = await messenger.downloads.search({id: downldItemID});

    if (downldItems && downldItems.length > 0) {
      let backupFilePath = downldItems[0].filename;
      let backupConfMsg = messenger.i18n.getMessage("clipMgrBackupConfirm", backupFilePath);

      gBackupConfirmMsgBox.setMessage(backupConfMsg);
      gBackupConfirmMsgBox.showModal();
    }
  }
  catch (e) {
    if (e.fileName == "undefined") {
      // User cancelled from Save As dialog.
    }
    else {
      console.error("Clippings/mx::backup.js: backup(): " + e);
      window.alert(messenger.i18n.getMessage("backupError", e));
    }
  }
  finally {
    window.focus();
  }
}


function closeDlg()
{
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}


//
// Event handlers
//

$(window).keydown(aEvent => {
  if (aEvent.key == "Enter") {
    if (aEvent.target.tagName == "BUTTON" && aEvent.target.id != "btn-accept"
        && !aEvent.target.classList.contains("dlg-accept")) {
      aEvent.target.click();
      aEvent.preventDefault();
      return;
    }

    // Prevent duplicate invocation of default action button in modal dialogs.
    if (aeDialog.isOpen()) {
      if (! aEvent.target.classList.contains("default")) {
        aeDialog.acceptDlgs();
      }
    }
    else {
      if (aEvent.target.id != "btn-accept") {
        backup();
      }
    }
  }
  else if (aEvent.key == "Escape") {
    closeDlg();
  }
});

$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});
