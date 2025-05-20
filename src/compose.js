/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


const DEBUG = false;
const HTMLPASTE_AS_FORMATTED = 1;
const HTMLPASTE_AS_IS = 2;

let gShowPastePrompt = false;


//
// Compose script functions that can be called from background script
//

function getSelectedText()
{
  log("Clippings/mx::compose.js::getSelectedText()");
  
  let selection = document.defaultView.getSelection();
  let content = selection.toString() || "";
  let msg = {
    msgID: "new-from-selection",
    content,
  };

  log(`Clippings/mx::compose.js::getSelectedText(): Sending selected text to extension page`);
  
  // Can't use `messenger` namespace inside a compose script.
  browser.runtime.sendMessage(msg);
}


function insertClipping(aContent, aIsPlainText, aHTMLPasteMode, aAutoLineBreak, aIsQuoted)
{
  log("Clippings/mx::compose.js: >> insertClipping()");
  
  if (aIsPlainText) {
    insertTextIntoPlainTextEditor(aContent, aIsQuoted);
  }
  else {
    insertTextIntoRichTextEditor(aContent, aAutoLineBreak, aHTMLPasteMode, aIsQuoted);
  }
}


//
// Message handlers
//

browser.runtime.onMessage.addListener(aMessage => {
  log(`Clippings/mx: Compose script received message "${aMessage.id}" from MailExtension.`);

  let resp = null;
  
  switch (aMessage.id) {
  case "paste-clipping":
    insertClipping(aMessage.content, aMessage.isPlainText, aMessage.htmlPaste, aMessage.autoLineBreak, aMessage.pasteAsQuoted);
    break;

  case "set-paste-prompt-pref":
    gShowPastePrompt = aMessage.showPastePrompt;
    break;

  case "get-paste-prompt-pref":
    resp = gShowPastePrompt;
    break;
    
  default:
    break;
  }

  if (resp !== null) {
    return Promise.resolve(resp);
  }
});


//
// Helper functions
//

function insertTextIntoPlainTextEditor(aClippingText, aIsQuoted)
{
  let hasHTMLTags = aClippingText.search(/<[a-z1-6]+( [a-z]+(\="?.*"?)?)*>/i) != -1;
  let clippingText = aClippingText;

  if (hasHTMLTags) {
    clippingText = clippingText.replace(/&/g, "&amp;");
    clippingText = clippingText.replace(/</g, "&lt;");
    clippingText = clippingText.replace(/>/g, "&gt;");
  }
  else {
    // Could be plain text but with angle brackets, e.g. for denoting URLs
    // or email addresses, e.g. <joel_user@acme.com>, <http://www.acme.com>
    let hasOpenAngleBrackets = clippingText.search(/</) != -1;
    let hasCloseAngleBrackets = clippingText.search(/>/) != -1;

    if (hasOpenAngleBrackets) {
      clippingText = clippingText.replace(/</g, "&lt;");
    }
    if (hasCloseAngleBrackets) {
      clippingText = clippingText.replace(/>/g, "&gt;");	  
    }
  }

  if (aIsQuoted) {
    clippingText = clippingText.replace(/\n/g, "<br>&gt; ");
    clippingText = '<span style="white-space: pre-wrap; display: block; width: 98vw;">&gt; ' + clippingText + "</span>";
  }

  let selection = document.getSelection();
  let range = selection.getRangeAt(0);
  range.deleteContents();

  let frag = range.createContextualFragment(DOMPurify.sanitize(clippingText));
  range.insertNode(frag);
  range.collapse();
}


function insertTextIntoRichTextEditor(aClippingText, aAutoLineBreak, aPasteMode, aIsQuoted)
{
  log("Clippings/mx::compose.js: >> insertTextIntoRichTextEditor()");

  let hasHTMLTags = aClippingText.search(/<[a-z1-6]+( [a-z]+(\="?.*"?)?)*>/i) != -1;
  let hasRestrictedHTMLTags = aClippingText.search(/<\?|<%|<!DOCTYPE|(<\b(html|head|body|meta|script|applet|embed|object|i?frame|frameset)\b)/i) != -1;
  let clippingText = aClippingText;

  if (hasHTMLTags) {
    if (hasRestrictedHTMLTags || aPasteMode == HTMLPASTE_AS_IS) {
      clippingText = clippingText.replace(/&/g, "&amp;");
      clippingText = clippingText.replace(/</g, "&lt;");
      clippingText = clippingText.replace(/>/g, "&gt;");
    }
  }
  else {
    // Could be plain text but with angle brackets, e.g. for denoting URLs
    // or email addresses, e.g. <joel_user@acme.com>, <http://www.acme.com>
    let hasOpenAngleBrackets = clippingText.search(/</) != -1;
    let hasCloseAngleBrackets = clippingText.search(/>/) != -1;

    if (hasOpenAngleBrackets) {
      clippingText = clippingText.replace(/</g, "&lt;");
    }
    if (hasCloseAngleBrackets) {
      clippingText = clippingText.replace(/>/g, "&gt;");	  
    }
  }

  let hasLineBreakTags = clippingText.search(/<br|<p/i) != -1;
  if (aAutoLineBreak && !hasLineBreakTags) {
    clippingText = clippingText.replace(/\n/g, "<br>");
  }

  if (aIsQuoted) {
    clippingText = '<blockquote type="cite">' + clippingText + "</blockquote>"
  }

  let selection = document.getSelection();
  let range = selection.getRangeAt(0);
  range.deleteContents();

  let frag = range.createContextualFragment(DOMPurify.sanitize(clippingText));
  range.insertNode(frag);
  range.collapse();

  return true;
}


//
// Error reporting and debugging output
//

function log(aMessage)
{
  if (DEBUG) { console.log(aMessage); }
}


function info(aMessage)
{
  if (DEBUG) { console.info(aMessage); }
}


function warn(aMessage)
{
  if (DEBUG) { console.warn(aMessage); }
}
