/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeConstants"];


var aeConstants = {
  EXTENSION_ID: "clippings-tb@aecreations.github.io",

  // Host app GUIDs
  HOSTAPP_FX_GUID: "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}",
  HOSTAPP_TB_GUID: "{3550f703-e582-4d05-9a08-453d09bdfdc6}",

  // Clippings datasource files
  CLIPDAT_FILE_NAME: "clipdat2.rdf",
  CLIPDAT_1X_FILE_NAME: "clipdat.rdf",
  OLD_BACKUP_DIR_NAME:   ".clipbak",
  BACKUP_DIR_NAME: "clippings-backup",

  // Constants for HTML paste options
  HTMLPASTE_ASK_THE_USER: 0,
  HTMLPASTE_AS_HTML:      1,
  HTMLPASTE_AS_IS:        2,

  // HTML frame user alert message
  HTML_FRAME_CREATE: 1,
  HTML_FRAME_PASTE:  2,

  // Shortcut help HTML document
  SHORTCUT_HELP_FILENAME: "clipkeys.html",
  SHORTCUT_HELP_PRINT_FILENAME: "clipKeysPrn.html",

  // Message IDs for messages passed between chrome and frame script
  MSG_REQ_IS_READY_FOR_SHORTCUT_MODE: "clippings@aecreations.github.io:req_isReadyForShortcutMode",
  MSG_RESP_IS_READY_FOR_SHORTCUT_MODE: "clippings@aecreations.github.io:resp_isReadyForShortcutMode",
  MSG_REQ_INSERT_CLIPPING: "clippings@aecreations.github.io:req_insertClipping",
  MSG_REQ_NEW_CLIPPING_FROM_TEXTBOX: "clippings@aecreations.github.io:req_newClippingFromTextbox",
  MSG_RESP_NEW_CLIPPING_FROM_TEXTBOX: "clippings@aecreations.github.io:resp_newClippingFromTextbox",
  MSG_REQ_NEW_CLIPPING_FROM_SELECTION: "clippings@aecreations.github.io:req_newClippingFromSelection",
  MSG_RESP_NEW_CLIPPING_FROM_SELECTION: "clippings@aecreations.github.io:resp_newClippingFromSelection",
  MSG_REQ_HTML_PASTE_OPTION: "clippings@aecreations.github.io:req_htmlPasteOption",
  MSG_REQ_HTML_FRAME: "clippings@aecreations.github.io:req_htmlFrame"
};
