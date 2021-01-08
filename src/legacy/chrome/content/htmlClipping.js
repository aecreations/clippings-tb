/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gDialogArgs = window.arguments[0];


function init()
{
  document.addEventListener("dialogaccept", aEvent => { accept() });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
}


function accept()
{
  var richTextInsertOption = document.getElementById("rich-text-insert-option");
  gDialogArgs.pasteAsRichText = richTextInsertOption.selectedIndex == 0;
  gDialogArgs.userCancel = false;
  return true;
}

function cancel()
{
  gDialogArgs.userCancel = true;
  return true;
}
