/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gExtPermStrKeys = {
  clipboardRead: "extPrmClipbdR",
};

let gWndID, gTabID, gOpenerWndID, gExtPerm, gExecActionID;


// Page initialization
$(async () => {
  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = gOS = platform.os;
  aeInterxn.init(gOS);

  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;

  let params = new URLSearchParams(window.location.search);
  gOpenerWndID = params.get("openerWndID");

  await populateRequestedPermission();

  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {focused: true});
  gWndID = wnd.id;

  let tab = await messenger.tabs.getCurrent();
  gTabID = tab.id;

  $(".hyperlink").on("click", aEvent => {
    aEvent.preventDefault();
    messenger.tabs.create({url: aEvent.target.href});
  });

});


async function populateRequestedPermission()
{
  let resp = await messenger.runtime.sendMessage({
    msgID: "get-perm-req-key",
    opener: gOpenerWndID,
  });
  gExtPerm = resp.extPerm;
  gExecActionID = resp.execActionID;

  let strKey = gExtPermStrKeys[gExtPerm];
  $("#ext-perm").text(messenger.i18n.getMessage(strKey));

  $("#perm-hlp-link").attr("href", aeConst.PERM_HLP_URL);
}


async function focusOpenerWnd(aExecActionID)
{
  let msg = {
    msgID: "focus-ext-window",
    wndID: gOpenerWndID
  };

  if (aExecActionID) {
    msg.execActionMsgID = aExecActionID;
  }
  
  try {
    await messenger.runtime.sendMessage(msg);
  }
  catch (e) {
    // Opener window was closed
  }
}


function closePage()
{
  messenger.tabs.remove(gTabID);
}


//
// Event handlers
//

$("#dlg-accept").on("click", async (aEvent) => {
  $("#dlg-btns > button").prop("disabled", true);
  let permGranted = await messenger.permissions.request({
    permissions: [gExtPerm],
  });

  if (permGranted) {
    await focusOpenerWnd(gExecActionID);
    closePage();
  }
  else {
    $("#dlg-btns > button").prop("disabled", false);
  }
});

$("#dlg-cancel").on("click", async (aEvent) => {
  await focusOpenerWnd();
  closePage();
});

$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


messenger.runtime.onMessage.addListener(aRequest => {
  let resp;
  
  if (aRequest.msgID == "ping-perms-req-pg") {
    resp = {
      isOpen: true,
      wndID: gWndID,
      tabID: gTabID,
    };
  }
  else if (aRequest.msgID == "reload-perms-req-pg") {
    populateRequestedPermission();
    messenger.windows.update(gWndID, {focused: true});
    messenger.tabs.update(gTabID, {active: true});
  }

  if (resp) {
    return Promise.resolve(resp);
  }
});


//
// Utilities
//

function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, {SAFE_FOR_JQUERY: true});
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
