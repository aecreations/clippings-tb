/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


function init()
{
  let dlgArgs = window.arguments[0];
  
  for (let fmt of dlgArgs.dtPlaceholders) {
    let dtValue = moment().format(fmt);
    dlgArgs.dtReplaced.push(dtValue);
  }

  window.setTimeout(function () { window.close() }, 800);
}
