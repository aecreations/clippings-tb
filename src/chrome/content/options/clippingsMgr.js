/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");


function initPrefPaneClippingsMgr()
{
  initDlg();
}


function getOS() {
  // This is invoked by the XHTML file in the <iframe> which displays the
  // shortcut key legend.
  return aeUtils.getOS();
}
