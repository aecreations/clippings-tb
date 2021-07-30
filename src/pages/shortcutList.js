/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const WNDH_SHORTCUT_LIST = 272;
const WNDW_SHORTCUT_LIST = 436;
const DLG_HEIGHT_ADJ_WINDOWS = 14;

let gOS;


// DOM utility
function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, { SAFE_FOR_JQUERY: true });
}


// Initialize dialog
$(async () => {
  let envInfo = await messenger.runtime.sendMessage({ msgID: "get-env-info" });
  document.body.dataset.os = gOS = envInfo.os;

  initShortcutList();

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


$(window).keydown(async (aEvent) => {
  if (aEvent.key == "Escape") {
    cancel(aEvent);
  }
});


async function initShortcutList()
{
  $("#shortcut-list-toolbar > #paste-clipping").click(pasteClipping);

  $("#shortcut-list-toolbar > #export-shct-list").click(aEvent => {
    exportShortcutList();
  });

  $("#shortcut-list-toolbar > #close").click(aEvent => {
    closeDlg();
  });
  
  let updWndInfo = {
    width: WNDW_SHORTCUT_LIST,
    height: WNDH_SHORTCUT_LIST,
  };
  if (gOS == "win") {
    updWndInfo.height += DLG_HEIGHT_ADJ_WINDOWS;
  }
  
  await messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, updWndInfo);

  let msg = {
    msgID: "get-shct-key-list-html",
    isFullHTMLDoc: false,
  };
  let shctListHTML = await messenger.runtime.sendMessage(msg);

  $("#shortcut-list-content").append(sanitizeHTML(shctListHTML));

  let tblWidth = window.innerWidth;
  $("#shortcut-list-content > table > thead").css({ width: `${tblWidth}px` });
  $("#shortcut-list-content > table > tbody").css({ width: `${tblWidth}px` });

  $("#shortcut-list-content > table > tbody > tr").on("mouseup", aEvent => {
    $("#shortcut-list-content > table > tbody > tr").removeClass("selected-row");
    $(aEvent.target).parent().addClass("selected-row");

    if ($("#paste-clipping").attr("disabled")) {
      $("#paste-clipping").removeAttr("disabled");
    }
  }).on("dblclick", pasteClipping);
}


async function pasteClipping(aEvent)
{ 
  let clippingKey = $("#shortcut-list-content > table > tbody > tr.selected-row td:first-child").text();
  let clippingID = $("#shortcut-list-content > table > tbody > tr.selected-row").attr("data-id");
  await execShortcut(clippingKey, clippingID);
}


async function exportShortcutList()
{
  let msg = {
    msgID: "get-shct-key-list-html",
    isFullHTMLDoc: true,
  };
  let htmlData = await messenger.runtime.sendMessage(msg);

  let blobData = new Blob([htmlData], { type: "text/html;charset=utf-8"});
  let downldOpts = {
    url: URL.createObjectURL(blobData),
    filename: aeConst.HTML_EXPORT_SHORTCUTS_FILENAME,
    saveAs: true,
  };

  let downldItemID;
  try {
    downldItemID = await messenger.downloads.download(downldOpts);
    log("Clippings/mx::shortcutList.js: Successfully exported the shortcut list.");
  }
  catch (e) {
    if (e.fileName == "undefined") {
      log("User cancel");
    }
    else {
      console.error(e);
      window.alert("Sorry, an error occurred while creating the export file.\n\nDetails:\n" + getErrStr(e));
    }
  }
  finally {
    window.focus();
  }
}

async function execShortcut(aShortcutKey, aClippingID)
{
  await messenger.aeClippingsLegacy.insertClipping(Number(aClippingID));
  closeDlg();
}


function cancel(aEvent)
{
  closeDlg();
}


async function closeDlg()
{
  await messenger.runtime.sendMessage({ msgID: "close-keybd-paste-dlg" });
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


function getErrStr(aErr)
{
  let rv = `${aErr.name}: ${aErr.message}`;

  if (aErr.fileName) {
    rv += "\nSource: " + aErr.fileName;
  }
  else {
    rv += "\nSource: unknown";
  }

  if (aErr.lineNumber) {
    rv += ":" + aErr.lineNumber;
  }

  return rv;
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
