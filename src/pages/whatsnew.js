/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";


// Page initialization
$(async () => {
  let extInfo = messenger.runtime.getManifest();
  $("#latest-ver").text(messenger.i18n.getMessage("upgrade", extInfo.name));
  $("#ver-subhead").text(messenger.i18n.getMessage("aboutExtVer", aeConst.CURR_MAJOR_VER));
  let contribCTA = messenger.i18n.getMessage("contribCTA", [extInfo.name, aeConst.DONATE_URL, aeConst.CONTRIB_URL]);
  $("#contrib-cta").html(sanitizeHTML(contribCTA));

  let {os} = await messenger.runtime.getPlatformInfo();
  let keybShct;
  if (os == "mac") {
    keybShct = `${messenger.i18n.getMessage("keyMacCtrl")}${messenger.i18n.getMessage("keyOption")}V`;
  }
  else {
    keybShct = `${messenger.i18n.getMessage("keyAlt")}+${messenger.i18n.getMessage("keyShift")}+S`;
  }
  $("#whats-new-tb1").text(messenger.i18n.getMessage("whatsNewTb1", keybShct));

  $("#link-website > a").attr("href", extInfo.homepage_url);
  $("#link-atn > a").attr("href", aeConst.ATN_URL);
  $("#link-blog > a").attr("href", aeConst.BLOG_URL);
  $("#link-forum > a").attr("href", aeConst.FORUM_URL);

  $("#btn-close").on("click", async (aEvent) => { closePage() });

  $("a").on("click", aEvent => {
    aEvent.preventDefault();
    gotoURL(aEvent.target.href);
  });

  let useAccentColor = await aePrefs.getPref("useAccentColor");
  aeVisual.enableAccentColor(useAccentColor);
});


function gotoURL(aURL)
{
  messenger.windows.openDefaultBrowser(aURL);
}


async function closePage()
{
  let tab = await messenger.tabs.getCurrent();
  messenger.tabs.remove(tab.id);
}


function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, {SAFE_FOR_JQUERY: true});
}


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.getAttribute("type") != "text") {
    aEvent.preventDefault();
  }
});
