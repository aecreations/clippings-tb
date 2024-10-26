/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gComposeTabID = null;


async function init()
{
  let params = new URLSearchParams(window.location.search);
  gComposeTabID = Number(params.get("compTabID"));

  window.focus();
  document.getElementById("paste-as-normal").focus();

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
}


async function accept(aEvent)
{
  let pasteAsQuoted = document.getElementById("paste-as-quoted").checked;

  await messenger.runtime.sendMessage({
    msgID: "close-paste-options-dlg",
    composeTabID: gComposeTabID,
    pasteAsQuoted,
    userCancel: false,
  });
  closeDlg();
}


async function cancel(aEvent)
{
  await messenger.runtime.sendMessage({
    msgID: "close-paste-options-dlg",
    composeTabID: gComposeTabID,
    pasteAsQuoted: null,
    userCancel: true,
  });
  closeDlg();
}


function closeDlg()
{
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


//
// Event handlers
//

document.addEventListener("DOMContentLoaded", aEvent => { init() });

document.getElementById("btn-accept").addEventListener("click", aEvent => {
  accept(aEvent);
});

document.getElementById("btn-cancel").addEventListener("click", aEvent => {
  cancel(aEvent);
});

window.addEventListener("keydown", aEvent => {
  if (aEvent.key == "Enter") {
    if (aEvent.target.tagName == "BUTTON" && aEvent.target.id != "btn-accept"
        && !aEvent.target.classList.contains("dlg-accept")) {
      aEvent.target.click();
      aEvent.preventDefault();
      return;
    }

    if (aEvent.target.id != "btn-accept") {
      accept(aEvent);
    }
  }
  else if (aEvent.key == "Escape") {
    cancel();
  }
});
