/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeInsertTextIntoTextbox"];


/*
 * Insert the given text into the textbox.
 * 
 * @param aTextboxElt    A DOM object representing a textbox element
 * @param aInsertedText  The text to insert into the text inside the textbox
 */
function aeInsertTextIntoTextbox(aTextboxElt, aInsertedText)
{
  var text, pre, post, pos;
  text = aTextboxElt.value;

  if (aTextboxElt.selectionStart == aTextboxElt.selectionEnd) {
    var point = aTextboxElt.selectionStart;
    pre = text.substring(0, point);
    post = text.substring(point, text.length);
    pos = point + aInsertedText.length;
  }
  else {
    var p1 = aTextboxElt.selectionStart;
    var p2 = aTextboxElt.selectionEnd;
    pre = text.substring(0, p1);
    post = text.substring(p2, text.length);
    pos = p1 + aInsertedText.length;
  }

  aTextboxElt.value = pre + aInsertedText + post;
  aTextboxElt.selectionStart = pos;
  aTextboxElt.selectionEnd = pos;
}
