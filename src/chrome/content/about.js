/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {AddonManager} = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
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
  });

  $("license-info-link").addEventListener("click", aEvent => {
    // TO DO: Open 'resource://LICENSE.txt' in mini-help window.
    window.alert("Clippings for Thunderbird is available under the Mozilla Public License (MPL), version 2.0.");
  });
}
