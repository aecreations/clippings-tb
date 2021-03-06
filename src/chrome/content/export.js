/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

var gStrBundle;
var gExportFormatList;
var gClippingsSvc;


//
// DOM utility function
//

function $(aID) {
  return document.getElementById(aID);
}



function init() 
{
  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    alertEx(e);
  }

  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
  gExportFormatList = $("export-format-list");
  gExportFormatList.selectedIndex = 0;
  gExportFormatList.focus();
  gExportFormatList.click();

  // Hidden HTML editor - HTML export hack!
  var editor = $("html-export");
  editor.src = "export.html";
  editor.makeEditable("html", false);

  document.addEventListener("dialogaccept", aEvent => {
    exportClippings();
    aEvent.preventDefault();
  });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
}


function exportFormatList_click(event)
{
  var formatDesc = $("format-description");
  if (formatDesc.firstChild) {
    formatDesc.removeChild(formatDesc.firstChild);
  }

  var desc;

  switch (gExportFormatList.selectedIndex) {
  case 0:
    desc = gStrBundle.getString("clippingsFmtDesc");
    break;

  case 1:
    desc = gStrBundle.getString("clippingsWxFmtDesc");
    break;

  case 2:
    desc = gStrBundle.getString("csvFmtDesc");
    break;
    
  case 3:
    desc = gStrBundle.getString("htmlFmtDesc");
    break;

  default:
    break;
  }

  var textNode = document.createTextNode(desc);
  formatDesc.appendChild(textNode);
}


function exportClippings()
{
  var fileType;
  var fp = Components.classes["@mozilla.org/filepicker;1"]
                     .createInstance(Components.interfaces.nsIFilePicker);
  fp.init(window, gStrBundle.getString("dlgTitleExportClippings"), fp.modeSave);

  switch (gExportFormatList.selectedIndex) {
  case 0:  // Clippings RDF/XML
    fp.defaultString = gStrBundle.getString("clipdat2.rdf");
    fp.defaultExtension = "rdf";
    fp.appendFilter(gStrBundle.getString("rdfExportFilterDesc"), "*.rdf");
    fileType = gClippingsSvc.FILETYPE_RDF_XML;
    break;

  case 1:  // Clippings/wx JSON
    fp.defaultString = gStrBundle.getString("clippings.json");
    fp.defaultExtension = "json";
    fp.appendFilter(gStrBundle.getString("wxJSONExportFilterDesc"), "*.json");
    fileType = gClippingsSvc.FILETYPE_WX_JSON;
    break;

  case 2:  // CSV
    fp.defaultString = gStrBundle.getString("clippings.csv");
    fp.defaultExtension = "csv";
    fp.appendFilter(gStrBundle.getString("csvExportFilterDesc"), "*.csv");
    fileType = gClippingsSvc.FILETYPE_CSV;
    break;
    
  case 3:  // HTML
    fp.defaultString = gStrBundle.getString("clippings.html");
    fp.defaultExtension = "html";
    fp.appendFilter(gStrBundle.getString("htmlFilterDesc"), "*.html");
    break;

  default:
    break;
  }

  let fpShownCallback = {
    done: function (aResult) {
      if (aResult == fp.returnCancel) {
        return;
      }

      if (aResult == fp.returnReplace) {
	var oldFile = fp.file.QueryInterface(Components.interfaces.nsIFile);
	oldFile.remove(false);
      }

      var url = fp.fileURL.QueryInterface(Components.interfaces.nsIURI).spec;
      var path = fp.file.QueryInterface(Components.interfaces.nsIFile).path;
      var fnExport;

      if (fileType == gClippingsSvc.FILETYPE_RDF_XML
	  || fileType == gClippingsSvc.FILETYPE_CLIPPINGS_1X
          || fileType == gClippingsSvc.FILETYPE_WX_JSON
          || fileType == gClippingsSvc.FILETYPE_CSV) {

	fnExport = function () { 
	  gClippingsSvc.exportToFile(url, fileType, false);
	};
      }
      // HTML export.
      else {
	data = gClippingsSvc.getClippingsAsHTML();
	
	fnExport = function () {
	  gClippingsSvc.writeFile(url, data);
	};
      }

      try {
	fnExport();
      }
      catch (e) {
	if (e.result === undefined) {
	  alertEx(gStrBundle.getString("alertExportFailed"));
	}
	else if (e.result == Components.results.NS_ERROR_NOT_INITIALIZED) {
	  alertEx(gStrBundle.getString("alertExportFailedNoDS"));
	}
	else if (e.result == Components.results.NS_ERROR_OUT_OF_MEMORY) {
	  alertEx(gStrBundle.getString("errorOutOfMemory"));
	}
	else if (e.result == Components.results.NS_ERROR_FILE_ACCESS_DENIED) {
	  alertEx(gStrBundle.getString("errorAccessDenied"));
	}
	else if (e.result == Components.results.NS_ERROR_FILE_READ_ONLY) {
	  alertEx(gStrBundle.getString("errorFileReadOnly"));
	}
	else if (e.result == Components.results.NS_ERROR_FILE_DISK_FULL) {
	  alertEx(gStrBundle.getString("errorDiskFull"));
	}
	else {
	  alertEx(gStrBundle.getString("alertExportFailed"));
	}
      }
      
      alertEx(gStrBundle.getFormattedString("exportSuccess", [path]));
      window.close();
    }
  };

  fp.open(fpShownCallback);
}


function alertEx(aMessage) 
{
  var title = gStrBundle.getString("appName");
  var prmpt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
  prmpt.alert(null, title, aMessage);
}


function cancel() {
  return true;
}
