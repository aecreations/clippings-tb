/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
let {aeString} = ChromeUtils.import("resource://clippings/modules/aeString.js");
let {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
let {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
//let {aeClippingsMenu} = ChromeUtils.import("resource://clippings/modules/aeClippingsMenu.js");
//let {aeCreateClippingHelper} = ChromeUtils.import("resource://clippings/modules/aeCreateClippingHelper.js");
let {aeClippingSubst} = ChromeUtils.import("resource://clippings/modules/aeClippingSubst.js");
//let {aeInsertTextIntoTextbox} = ChromeUtils.import("resource://clippings/modules/aeInsertTextIntoTextbox.js");

Services.scriptloader.loadSubScript("chrome://clippings/content/tbMsgComposeOverlay.js", window, "UTF-8");


function onLoad(aActivatedWhileWindowOpen)
{
  aeUtils.log("Clippings/mx::messengercompose.js: Initializing integration with message compose window.");
  
  let strBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  // TO DO: Avoid hard-coding UI strings.
  WL.injectElements(`
  <commandset id="composeCommands">
    <command id="ae_clippings_manager" 
     oncommand="window.aecreations.clippings.openClippingsManager()"/>
    <command id="ae_new_clipping_from_clpbd" 
     oncommand="window.aecreations.clippings.newFromClipboard()"/>
    <command id="ae_new_clipping_from_selection"
     oncommand="window.aecreations.clippings.newFromSelection()"/>
    <command id="ae_clippings_show_paste_options" 
     oncommand="window.aecreations.clippings.toggleShowPasteOptions()"/>
    <command id="ae_clippings_keyboard_insert" label="Insert Clipping"
     oncommand="window.aecreations.clippings.keyboardInsertClipping(event)"/>
  </commandset>

  <keyset id="tasksKeys">
    <key id="key_ae_clippings" key="v"
     modifiers="alt control" command="ae_clippings_keyboard_insert"/>
    <key id="key_ae_clippings_new" key="y"
     modifiers="alt shift" command="ae_clippings_keyboard_insert"/>
    
    <!-- For Mac OS X -->
    <key id="key_ae_clippings_mac" key="v"
     modifiers="alt meta" command="ae_clippings_keyboard_insert"/>
    <key id="key_ae_clippings_new_mac" key="y"
     modifiers="meta shift" command="ae_clippings_keyboard_insert"/>
  </keyset>

  <menupopup id="msgComposeContext">
    <menu id="ae-clippings-menu-1" label="Clippings"
     datasources="rdf:null"
     ref="http://clippings.mozdev.org/rdf/user-clippings-v2">

      <menupopup id="ae-clippings-popup-1">
        <menuitem id="ae-clippings-add" label="New From Selection..." accesskey="N" command="ae_new_clipping_from_selection"/>
        <menuitem label="Organize Clippings" accesskey="O" command="ae_clippings_manager"/>
	<menuseparator id="reset-auto-increment-vars-separator"/>
        <menu id="reset-auto-increment-vars" label="Reset Auto-increment Placeholders">
          <menupopup id="reset-auto-increment-vars-menu-popup"></menupopup>
        </menu>
        <menuseparator/>
      </menupopup>
    </menu>
  </menupopup>

  <popupset>
    <!-- Dialog panel for alert when attempting to create new clipping from
         clipboard, and clipboard doesn't contain any text. -->
    <panel id="ae-clippings-clipboard-alert" orient="vertical">
      <hbox align="center">
	<image class="alert-icon" />
        <description>Clipboard is empty or does not contain textual data.</description>
      </hbox>
      <hbox>
	<spacer flex="1"/>
        <button label="OK" oncommand="this.parentNode.parentNode.hidePopup()"/>
	<spacer flex="1"/>
      </hbox>
    </panel>

    <!-- Thunderbird status bar menu -->
    <menupopup id="ae-clippings-popup" 
     onpopupshowing="window.aecreations.clippings.initToolbarBtnCxtMenu(event)">
      <menuitem label="Organize Clippings" 
       accesskey="O"  default="true" 
       command="ae_clippings_manager"/>
      <menuitem id="ae-clippings-new-from-clipbd"
       label="New From Clipboard..." 
       accesskey="N" 
       command="ae_new_clipping_from_clpbd" />
      <menuseparator/>
      <menuitem id="ae-clippings-show-paste-opts"
       type="checkbox" checked="false" label="Show Quote Options When Pasting"
       accesskey="S"
       command="ae_clippings_show_paste_options" />
    </menupopup>
  </popupset>
  `);
  
  WL.injectCSS("chrome://clippings/content/style/overlay.css");

  window.aecreations.clippings.initClippings();
}


function onUnload(aDeactivatedWhileWindowOpen)
{
  // Cleaning up the window UI is only needed when the
  // add-on is being deactivated/removed while the window
  // is still open. It can be skipped otherwise.
  if (! aDeactivatedWhileWindowOpen) {
    return;
  }

  window.aecreations.clippings.unload();
}
