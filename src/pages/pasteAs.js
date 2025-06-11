/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gComposeTabID, gClippingContent;


// Dialog initialization
$(async () => {
  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = gOS = platform.os;
  aeInterxn.init(platform.os);

  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;

  let params = new URLSearchParams(window.location.search);
  gComposeTabID = Number(params.get("compTabID"));

  let resp = await messenger.runtime.sendMessage({
    msgID: "init-paste-as-dlg"
  });

  gClippingContent = resp.content;

  $("#clipping-name").text(resp.clippingName);
  $("#paste-cliptxt-html, #paste-cliptxt-plain, #paste-cliptxt-plain-html").on("click", aEvent => {
    pasteClipping(aEvent.target.id);
  });
  $("#btn-cancel").on("click", aEvent => { cancel() });

  $("#paste-cliptxt-html").focus();

  let pasteAsHTML = messenger.i18n.getMessage("pasteAsHTML");
  let pasteAsPlain = messenger.i18n.getMessage("pasteAsPlain");
  let pasteAsPlainHTML = messenger.i18n.getMessage("pasteAsPlainHTML");
  pasteAsHTML = aeVisual.formatShortcutKey(pasteAsHTML, "F");
  pasteAsPlain = aeVisual.formatShortcutKey(pasteAsPlain, "P");
  pasteAsPlainHTML = aeVisual.formatShortcutKey(pasteAsPlainHTML, "H");
  $("#paste-cliptxt-html").html(sanitizeHTML(pasteAsHTML));
  $("#paste-cliptxt-plain").html(sanitizeHTML(pasteAsPlain));
  $("#paste-cliptxt-plain-html").html(sanitizeHTML(pasteAsPlainHTML));

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


async function pasteClipping(aButtonID)
{
  let pasteFormat;
  if (aButtonID == "paste-cliptxt-html") {
    pasteFormat = aeConst.HTMLPASTE_AS_FORMATTED;
  }
  else if (aButtonID == "paste-cliptxt-plain-html") {
    pasteFormat = aeConst.HTMLPASTE_AS_IS;
  }
  else {
    pasteFormat = aeConst.HTMLPASTE_AS_PLAIN;    
  }

  await messenger.runtime.sendMessage({
    msgID: "paste-clipping-usr-fmt",
    processedContent: gClippingContent,
    composeTabID: gComposeTabID,
    pasteFormat,
  });

  closeDlg();
}


function cancel(aEvent)
{
  closeDlg();
}


async function closeDlg()
{
  await messenger.runtime.sendMessage({msgID: "close-paste-as-dlg"});
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, {SAFE_FOR_JQUERY: true});
}


//
// Event handlers
//

$(window).on("keydown", aEvent => {
  if (aEvent.key == "Escape") {
    closeDlg();
  }
  // Accelerator keys on paste option buttons
  else if (aEvent.key.toUpperCase() == "F") {
    $("#paste-cliptxt-html")[0].click();
  }
  else if (aEvent.key.toUpperCase() == "P") {
    $("#paste-cliptxt-plain")[0].click();
  }
  else if (aEvent.key.toUpperCase() == "H") {
    $("#paste-cliptxt-plain-html")[0].click();
  }
  else {
    aeInterxn.suppressBrowserShortcuts(aEvent);
  }
});


$(window).on("contextmenu", aEvent => {
  aEvent.preventDefault();
});
