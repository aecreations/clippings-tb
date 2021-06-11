/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


// Dialog initialization
$(async () => {
  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = platform.os;

  // Reset backup notification interval timer so that it fires 24 hours after
  // displaying this first-time backup dialog.
  await messenger.runtime.sendMessage({msgID: "clear-backup-notifcn-intv"});
  messenger.runtime.sendMessage({msgID: "set-backup-notifcn-intv"});
  
  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;

  $("#backup-now").click(aEvent => {
    messenger.runtime.sendMessage({ msgID: "backup-clippings" });
  });
  
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

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


function closeDlg()
{
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
