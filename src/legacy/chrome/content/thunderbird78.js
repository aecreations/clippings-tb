/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");


function init()
{
  let printLinks = document.querySelectorAll(".print-page");
  printLinks.forEach(aElt => {
    aElt.addEventListener("click", aEvent => { window.print() });
  });

  document.getElementById("open-clippings-mgr").addEventListener("click", aEvent => {
    openClippingsMgr();
  });

  let alwaysShowCb = document.getElementById("always-show");
  alwaysShowCb.checked = aeUtils.getPref("clippings.tb78.show_warning", true);

  alwaysShowCb.addEventListener("click", aEvent => {
    let alwaysShow = aEvent.target;
    aeUtils.setPref("clippings.tb78.show_warning", alwaysShow.checked);
  });

  document.getElementById("close-pg").addEventListener("click", aEvent => {
    window.close();
  });
}


function openClippingsMgr()
{
  var url = "chrome://clippings/content/clippingsMgr.xul";
  var wnd = window.open(url, "clippings_wndobj", "chrome,resizable");
  wnd.focus();
}


document.addEventListener("DOMContentLoaded", init);
