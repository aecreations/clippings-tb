/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {AddonManager} = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");


function $(aID) 
{
  return document.getElementById(aID);
}


function init()
{
  let strBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  let getClippingsAddon = AddonManager.getAddonByID(aeConstants.EXTENSION_ID);
  getClippingsAddon.then(aAddon => {
    $("ext-ver").value = strBundle.getFormattedString("versionInfo", [aAddon.version]);
    $("ext-desc").value = aAddon.description;
    $("creator-info").value = strBundle.getFormattedString("createdBy", [aAddon.creator]);
    $("homepg-hyperlink").setAttribute("href", aAddon.homepageURL);
  });

  $("homepg-hyperlink").addEventListener("click", aEvent => {
    let url = aEvent.target.getAttribute("href");
    aeUtils.openURLInNewTab(url);
  });

  $("license-info-link").addEventListener("click", aEvent => {
    Services.ww.openWindow(null, "chrome://clippings/content/LICENSE.txt", "ae_clippings_license", "chrome,centerscreen,dialog=no,resizable=yes,scrollbars=yes,width=680,height=500", {});
  });
}
