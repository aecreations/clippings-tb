/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {OS} = ChromeUtils.import("resource://gre/modules/osfile.jsm");
const {FileUtils} = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {AddonManager} = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
const {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

Services.scriptloader.loadSubScript("chrome://clippings/content/lib/i18n.js", this, "UTF-8");


const Cc = Components.classes;
const Ci = Components.interfaces;

const OUTPUT_PRINTER = 0;
const OUTPUT_FILE = 1;

var gDlgArgs, gLocaleData, gAddon;


function $(aID)
{
  return document.getElementById(aID);
}


function init() 
{
  gDlgArgs = window.arguments[0];
  gLocaleData = window.arguments[1];
  i18n.updateDocument({ extension: gLocaleData });
  
  var keyMap = gDlgArgs.keyMap;
  var keyCount = gDlgArgs.keyCount;

  var treeChildren = $("grid-content");

  for (let key of keyMap.keys()) {
    var treeItem = document.createXULElement("treeitem");
    var treeRow = document.createXULElement("treerow");
    var treeCellShortcutKey = document.createXULElement("treecell");
    var treeCellClippingName = document.createXULElement("treecell");
     
    treeCellShortcutKey.setAttribute("label", key);

    let clippingInfo = keyMap.get(key);
    treeCellClippingName.setAttribute("label", clippingInfo.name);
    treeCellClippingName.setAttribute("value", clippingInfo.id);

    treeRow.appendChild(treeCellShortcutKey);
    treeRow.appendChild(treeCellClippingName);
    treeItem.appendChild(treeRow);
    treeChildren.appendChild(treeItem);
  }

  if (gDlgArgs.showInsertClippingCmd) {
    $("insert-clipping").hidden = false;
  }

  AddonManager.getAddonByID(aeConstants.EXTENSION_ID).then(aAddon => {
    gAddon = aAddon;
  });
}


function selectClipping()
{
  var insertClippingBtn = $("insert-clipping");
  if (insertClippingBtn.hidden) {
    return;
  }
  if (insertClippingBtn.disabled) {
    insertClippingBtn.disabled = false;
  }
}


async function insertClipping()
{
  if (! gDlgArgs.showInsertClippingCmd) {
    return;
  }

  let shortcutListTreeView = $("shortcut-map-grid").view;
  let selectedIndex = shortcutListTreeView.selection.currentIndex;
  let selectedItem = shortcutListTreeView.getItemAtIndex(selectedIndex);
  let selectedID = selectedItem.firstChild.childNodes[1].getAttribute("value");

  let hostAppWnd = aeUtils.getRecentHostAppWindow();
  await hostAppWnd.aecreations.clippings.insertClipping(Number(selectedID));

  window.close();
}


function print() 
{
  outputShortcutList(OUTPUT_PRINTER);
}


function save() 
{
  outputShortcutList(OUTPUT_FILE);
}


function outputShortcutList(aOutputMode)
{
  var css = "";
  var data = "";

  if (aOutputMode == OUTPUT_PRINTER) {
    // Show printing instructions in the HTML output generated from Thunderbird
    // since most browsers warn or block JavaScript code that automatically
    // closes the browser window.
    if (gDlgArgs.printToExtBrowser) {
      css = '<style type="text/css" media="screen">'
          + ' .print-instructions {'
	  + '   background-color: #FFFFC0;'
	  + '   border: 1px solid #F8BF24;'
          + '   padding: 8px; '
          + '   font-family: sans-serif; font-weight: bold; '
	  + "} </style>"
          + '<style type="text/css" media="print">'
          + ' .print-instructions { '
	  + '   display: none; '
	  + "} </style>";
      data = '<body><p><span class="print-instructions">' + gLocaleData.localizeMessage("printShctHelpHTML") + "</span></p>";
    }
    else {
      data = '<body onload="window.print();window.close()">';
    }
  }
  else {
    data = "<body>";
  }

  let body = getShortcutKeyHelpContent();

  data += body + "</body>";

  var doctype = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">';
  var meta = '<META http-equiv="Content-Type" content="text/html; charset=UTF-8">';
  var header = "<html><head>" + meta + "<title>" + gLocaleData.localizeMessage("expHTMLTitle") + "</title>" + css + "</head>";
  var footer = "</html>";
  data = doctype + "\n" + header + "\n" + data + "\n" + footer;

  if (aOutputMode == OUTPUT_PRINTER) {
    // Write the HTML data to a temp file.
    var tempFile = FileUtils.getFile("TmpD", [aeConstants.SHORTCUT_HELP_PRINT_FILENAME]);
    tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

    aeUtils.log("Temp file path: " + tempFile.path);

    let writeFileOpts = {
      encoding: "utf-8",
      tmpPath: `${tempFile.path}.tmp`
    };
    
    OS.File.writeAtomic(tempFile.path, data, writeFileOpts).then(() => {
      // Open the temp file and automatically print it.
      if (gDlgArgs.printToExtBrowser) {
	// If on Thunderbird, open the generated HTML document in the default
	// web browser.
	tempFile.launch();
      }      
    }).catch(aErr => {
      let msg = gLocaleData.localizeMessage("errorSaveFailed") + "\n" + aErr;
      aeUtils.alertEx(title, msg);
      return;
    });
  }
  else if (aOutputMode == OUTPUT_FILE) {
    // Save shortcut key list to an HTML document.
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window, gLocaleData.localizeMessage("saveToHTML"), fp.modeSave);

    fp.defaultString = aeConstants.SHORTCUT_HELP_FILENAME;
    fp.defaultExtension = "html";
    fp.appendFilter(gLocaleData.localizeMessage("htmlFilterDesc"), "*.html");

    let fpShownCallback = {
      done: function (aResult) {

        if (aResult == fp.returnCancel) {
          return;
        }

        if (aResult == fp.returnReplace) {
          var oldFile = fp.file.QueryInterface(Ci.nsIFile);
          oldFile.remove(false);
        }

	let writeFileOpts = {
	  encoding: "utf-8",
	  tmpPath: `${fp.file.path}.tmp`
	};
	
	OS.File.writeAtomic(fp.file.path, data, writeFileOpts).catch(aErr => {
	  let msg = gLocaleData.localizeMessage("errorSaveFailed") + "\n" + aErr;
	  aeUtils.alertEx(title, msg);
	});
      }
    };

    fp.open(fpShownCallback);
  }
}


function getShortcutKeyHelpContent()
{
  let rv = "";

  if (getShortcutKeyHelpContent.htmlBody) {
    rv = getShortcutKeyHelpContent.htmlBody;
  }
  else {
    let pageHdg = gLocaleData.localizeMessage("expHTMLTitle");
    let appInfo = gLocaleData.localizeMessage(
      "expHTMLHostAppInfo",
      [gAddon.version, `${aeUtils.getHostAppName()} ${aeUtils.getHostAppVersion()}`]
    );
    let helpStr = gLocaleData.localizeMessage("expHTMLShctKeyInstrxnTB");
    let thShortcut = gLocaleData.localizeMessage("expHTMLShctKeyCol");
    let thClipping = gLocaleData.localizeMessage("expHTMLClipNameCol");
    
    let tbody = "";

    for (let key of gDlgArgs.keyMap.keys()) {
      tbody += `<tr><td>${key}</td><td>${gDlgArgs.keyMap.get(key).name}</td></tr>\n`;
    }

    rv = getShortcutKeyHelpContent.htmlBody = `<body>
  <h1>${pageHdg}</h1>
  <p class="app-info" style="font-size:small">${appInfo}</p>
  <p>${helpStr}</p>
  <table border="2">
    <thead>
      <th>${thShortcut}</th>
      <th>${thClipping}</th>
    </thead>
    <tbody>
      ${tbody}
    </tbody>
  </table>  
</body>`;
  }
  
  return rv;
}

getShortcutKeyHelpContent.htmlBody = "";
