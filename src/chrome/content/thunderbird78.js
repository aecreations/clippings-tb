/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");


function init()
{
  let os = aeUtils.getOS();
  document.body.dataset.os = os;

  if (os == "WINNT") {
    document.getElementById("windows-shct-notice").style.display = "block";
  }

  let printLinks = document.querySelectorAll(".print-page");
  printLinks.forEach(aElt => {
    aElt.addEventListener("click", aEvent => { window.print() });
  });

  let alwaysShowCb = document.getElementById("always-show");
  alwaysShowCb.checked = aeUtils.getPref("clippings.tb78.show_anncmt", true);

  alwaysShowCb.addEventListener("click", aEvent => {
    let alwaysShow = aEvent.target;
    aeUtils.setPref("clippings.tb78.show_anncmt", alwaysShow.checked);
  });

  document.getElementById("close-pg").addEventListener("click", aEvent => {
    window.close();
  });
}


document.addEventListener("DOMContentLoaded", init);
