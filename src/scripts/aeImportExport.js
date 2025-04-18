/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


let aeImportExport = function () {
  let _db = null;
  let _importFileTypes = [
    "application/json",
    "application/rdf+xml",    
  ];
  let _clippingLabels = [
    "", "red", "orange", "yellow", "green", "blue", "purple", "grey",
  ];

  // Default strings in export file - should be localized from messages.json
  let _shctTitle = "Clippings Shortcuts";
  let _hostAppStr = "Clippings on Thunderbird";
  let _shctKeyInstrxns = "To paste, press ALT+SHIFT+Y (Command+Shift+Y on Mac), then the shortcut key.";
  let _shctKeyCustNote = "";
  let _shctKeyColHdr = "Shortcut Key";
  let _clipNameColHdr = "Clipping Name";

  return {
    DEBUG: false,

    CLIPPINGS_JSON_VER: "6.0",
    CLIPPINGS_JSON_VER_WITH_SEQ: "6.1",
    CLIPPINGS_JSON_VER_WITH_SEP: "6.2",
    CLIPPINGS_JSON_CREATED_BY: "Clippings/mx",
    ROOT_FOLDER_ID: 0,
    LAST_SEQ_VALUE: 9999999,

    HTML_EXPORT_PAGE_TITLE: "Clippings",
    NONAME_CLIPPING: "Untitled Clipping",
    NONAME_FOLDER: "Untitled Folder",
    
    RDF_MIME_TYPE: "application/rdf+xml",
    RDF_SEQ: "http://www.w3.org/1999/02/22-rdf-syntax-ns#Seq",
    CLIPPINGS_RDF_NS: "http://clippings.mozdev.org/ns/rdf#",
    CLIPPINGS_RDF_ROOT_FOLDER: "http://clippings.mozdev.org/rdf/user-clippings-v2",

    setDatabase(aDatabase)
    {
      if (! _db) {
        _db = aDatabase;
      }
    },
    
    setL10nStrings(aStrings)
    {
      _shctTitle = aStrings.shctTitle;
      _hostAppInfo = aStrings.hostAppInfo;
      _shctKeyInstrxns = aStrings.shctKeyInstrxns;
      _shctKeyCustNote = aStrings.shctKeyCustNote;
      _shctKeyColHdr = aStrings.shctKeyColHdr;
      _clipNameColHdr = aStrings.clippingNameColHdr;
    },

    isValidFileType(aFile)
    {
      return _importFileTypes.includes(aFile.type);
    },

    isValidClippingsJSON(aImportRawJSON)
    {
      let rv = false;
      let importData;

      try {
        importData = JSON.parse(aImportRawJSON);
      }
      catch (e) {
        // SyntaxError - Raw JSON data is invalid.
        return rv;
      }

      let knownVersions = [
        this.CLIPPINGS_JSON_VER,
        this.CLIPPINGS_JSON_VER_WITH_SEQ,
        this.CLIPPINGS_JSON_VER_WITH_SEP,
      ];

      rv = ("userClippingsRoot" in importData
            && importData.userClippingsRoot instanceof Array
            && "version" in importData
            && knownVersions.includes(importData.version));

      return rv;
    },

    importFromJSON(aImportRawJSON, aReplaceShortcutKeys, aAppendItems, aDestFolderID)
    {
      if (! _db) {
        throw new Error("aeImportExport: Database not initialized!");
      }

      if (! aDestFolderID) {
        aDestFolderID = this.ROOT_FOLDER_ID;
      }

      let importData;

      try {
        importData = JSON.parse(aImportRawJSON);
      }
      catch (e) {
        // SyntaxError - Raw JSON data is invalid.
        throw e;
      }

      this._log("aeImportExport: Imported JSON data:");
      this._log(importData);

      this._getShortcutKeysToClippingIDs().then(aShortcutKeyLookup => {
        this._log("Starting JSON import...");
        try {
          this._importFromJSONHelper(aDestFolderID, importData.userClippingsRoot, aReplaceShortcutKeys, aShortcutKeyLookup, aAppendItems);
        }
        catch (e) {
          console.error("Import of JSON data failed!");
          throw e;
        }
        this._log("Import completed!");

      }).catch(aErr => { throw aErr });
    },
    
    _importFromJSONHelper(aParentFolderID, aImportedItems, aReplaceShortcutKeys, aShortcutKeys, aAppendItems)
    {
      _db.transaction("rw", _db.clippings, _db.folders, () => {
        let importedClippings = [];
        let clippingsWithKeyConflicts = [];

        for (let item of aImportedItems) {
          if ("children" in item) {
            if (! (item.children instanceof Array)) {
              continue;
            }

            let folder = {
              name: ("name" in item ? item.name : this.NONAME_FOLDER),
              parentFolderID: aParentFolderID
            };

            if (aAppendItems) {
              // Append items to root folder, but preserve sort order relative to
              // the other imported items.
              let seq = ("seq" in item) ? item.seq : 0;

              if (aParentFolderID == this.ROOT_FOLDER_ID) {
                folder.displayOrder = this.LAST_SEQ_VALUE + seq;
              }
              else {
                folder.displayOrder = seq;
              }
            }
            else {
              if ("seq" in item) {
                folder.displayOrder = item.seq;
              }
            }

            if ("sid" in item) {
              folder.sid = item.sid;
            }
            
            _db.folders.add(folder).then(aNewFolderID => {
              this._importFromJSONHelper(aNewFolderID, item.children, aReplaceShortcutKeys, aShortcutKeys, aAppendItems);
            });
          }
          else {
            let clipping = {};
            let shortcutKey = "";

            if (!("shortcutKey" in item) || typeof item.shortcutKey != "string") {
              item.shortcutKey = "";
            }

            let impShctKey = item.shortcutKey.toUpperCase();
            if (aShortcutKeys[impShctKey]) {
              if (aReplaceShortcutKeys) {
                shortcutKey = impShctKey;
                clippingsWithKeyConflicts.push(aShortcutKeys[impShctKey]);
              }
              else {
                shortcutKey = "";
              }
            }
            else {
              shortcutKey = impShctKey;
            }

            let label = "";
            if ("label" in item && typeof item.label == "string"
                && _clippingLabels.includes(item.label.toLowerCase())) {
              label = item.label.toLowerCase();
            }
            
            clipping = {
              name: ("name" in item ? item.name : this.NONAME_CLIPPING),
              content: ("content" in item ? item.content : ""),
              label,
              shortcutKey,
              sourceURL: ("sourceURL" in item ? item.sourceURL : ""),
              parentFolderID: aParentFolderID
            };

            if (item.sep) {
              clipping.name = messenger.i18n.getMessage("sepName");
              clipping.separator = true;
            }

            if (aAppendItems) {
              // Append items to root folder, but preserve sort order relative to
              // the other imported items.
              let seq = ("seq" in item) ? item.seq : 0;

              if (aParentFolderID == this.ROOT_FOLDER_ID) {
                clipping.displayOrder = this.LAST_SEQ_VALUE + seq;
              }
              else {
                clipping.displayOrder = seq;
              }
            }
            else {
              if ("seq" in item) {
                clipping.displayOrder = item.seq;
              }
            }

            if ("sid" in item) {
              clipping.sid = item.sid;
            }

            importedClippings.push(clipping);
          }
        }

        _db.clippings.bulkAdd(importedClippings).then(aLastAddedID => {
          if (aReplaceShortcutKeys) {
            for (let clippingID of clippingsWithKeyConflicts) {
              _db.clippings.update(clippingID, { shortcutKey: "" });
            }
          }
        });
      }).catch(aErr => {
        console.error("aeImportExport._importFromJSONHelper(): " + aErr);
        throw aErr;
      });
    },

    exportToJSON(aIncludeSrcURLs, aDontStringify, aFolderID, aExcludeFolderID, aIncludeDisplayOrder, aIncludeSeparators)
    {
      let expData = {
        version: this.CLIPPINGS_JSON_VER,
        createdBy: this.CLIPPINGS_JSON_CREATED_BY,
        userClippingsRoot: []
      };

      if (aIncludeDisplayOrder) {
        if (aIncludeSeparators) {
          expData.version = this.CLIPPINGS_JSON_VER_WITH_SEP;
        }
        else {
          expData.version = this.CLIPPINGS_JSON_VER_WITH_SEQ;
        }
      }

      if (! aFolderID) {
        aFolderID = this.ROOT_FOLDER_ID;
      }

      return new Promise((aFnResolve, aFnReject) => {
        this._exportToJSONHelper(aFolderID, aIncludeSrcURLs, aExcludeFolderID, aIncludeDisplayOrder, aIncludeSeparators).then(aExpItems => {
          expData.userClippingsRoot = aExpItems;

          if (aDontStringify) {
            aFnResolve(expData);
          }
          aFnResolve(JSON.stringify(expData));

        }).catch(aErr => {
          console.error("aeImportExport.exportToJSON(): " + aErr);
          aFnReject(aErr);
        });
      });
    },

    _exportToJSONHelper(aFolderID, aIncludeSrcURLs, aExcludeFolderID, aIncludeDisplayOrder, aIncludeSeparators)
    {
      let rv = [];
      
      return new Promise((aFnResolve, aFnReject) => {
        _db.transaction("r", _db.clippings, _db.folders, () => {
          _db.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
            if (aExcludeFolderID !== undefined && aItem.id == aExcludeFolderID) {
              return;
            }
            
            let folder = {
              name: aItem.name,
              children: []
            };

            if (aIncludeDisplayOrder) {
              folder.seq = aItem.displayOrder || 0;
            }

            if ("sid" in aItem) {
              folder.sid = aItem.sid;
            }

            this._exportToJSONHelper(aItem.id, aIncludeSrcURLs, aExcludeFolderID, aIncludeDisplayOrder, aIncludeSeparators).then(aChildItems => {
              folder.children = aChildItems;
              rv.push(folder);
            });
          }).then(() => {
            return _db.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
              if (aItem.separator && !aIncludeSeparators) {
                return;
              }

              let clipping = {
                name: aItem.name,
                content: aItem.content,
                shortcutKey: aItem.shortcutKey,
                sourceURL: (aIncludeSrcURLs ? aItem.sourceURL : ""),
                label: aItem.label,
              };

              if (aIncludeDisplayOrder) {
                clipping.seq = aItem.displayOrder || 0;
              }
              
              if ("sid" in aItem) {
                clipping.sid = aItem.sid;
              }

              if (aItem.separator) {
                clipping.sep = true;
              }

              rv.push(clipping);
            });
          }).then(() => {
            aFnResolve(rv);
          });
        }).catch(aErr => {
          console.error("aeImportExport._exportToJSONHelper(): " + aErr);
          aFnReject(aErr);
        });
      });
    },

    async exportToHTML()
    {
      function exportToHTMLHelper(aFldrItems)
      {
        let rv = "<dl>";
        let that = aeImportExport;
        
        for (let item of aFldrItems) {
          if (item.children) {
            let name = that._escapeHTML(item.name);
            let dt = `<dt class="folder"><h2>${name}</h2></dt>`;
            let dd = "<dd>" + exportToHTMLHelper(item.children);
            dd += "</dd>";
            rv += dt + dd;
          }
          else {
            let name = that._escapeHTML(item.name);
            let dt = `<dt class="clipping"><h3>${name}</h3></dt>`;
            let text = that._escapeHTML(item.content);
            text = text.replace(/\n/g, "<br>");
            let dd = `<dd>${text}</dd>`;
            rv += dt + dd;
          }
        }

        rv = rv + "</dl>";
        return rv;
      }
      
      let rv = "";

      let expData;
      try {
        expData = await this.exportToJSON(false, true);
      }
      catch (e) {
        console.error("aeImportExport.exportToHTML(): " + e);
        throw e;
      }
      
      let htmlSrc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${this.HTML_EXPORT_PAGE_TITLE}</title></head><body><h1>${this.HTML_EXPORT_PAGE_TITLE}</h1>`;

      htmlSrc += exportToHTMLHelper(expData.userClippingsRoot);
      
      rv = htmlSrc + "</body></html>";

      return rv;
    },

    async exportToCSV(aExcludeFolderID)
    {
      function exportToCSVHelper(aFldrItems, aCSVData)
      {
        let that = aeImportExport;

        for (let item of aFldrItems) {
          if (item.children) {
            exportToCSVHelper(item.children, aCSVData);
          }
          else {
            let name = item.name;
            let content = item.content;
            content = content.replace(/\"/g, '""');
            aCSVData.push(`"${name}","${content}"`);
          }
        }
      }

      let rv = "";

      let expData;
      try {
        expData = await this.exportToJSON(false, true, this.ROOT_FOLDER_ID, aExcludeFolderID);
      }
      catch (e) {
        console.error("aeImportExport.exportToCSV(): " + e);
        throw e;
      }

      let csvData = [];
      exportToCSVHelper(expData.userClippingsRoot, csvData);
      rv = csvData.join("\r\n");

      return rv;
    },
    
    importFromRDF(aRDFRawData, aReplaceShortcutKeys, aAppendItems)
    {
      this._log(`aeImportExport.importFromRDF(): Reading raw RDF data (size: ${aRDFRawData.length} bytes)`);

      let dataSrc = $rdf.graph();
      try {
        $rdf.parse(aRDFRawData, dataSrc, this.CLIPPINGS_RDF_ROOT_FOLDER, this.RDF_MIME_TYPE);
      }
      catch (e) {
        console.error("aeImportExport.importFromRDF(): Failed to parse Clippings RDF data!\n" + e);
        throw e;
      }

      let jsonData = {
        version: "6.0"
      };
      
      let rootFolderNode = $rdf.sym(this.CLIPPINGS_RDF_ROOT_FOLDER);
      jsonData.userClippingsRoot = this._importFromRDFHelper(dataSrc, rootFolderNode);

      this._getShortcutKeysToClippingIDs().then(aShortcutKeyLookup => {
        this._importFromJSONHelper(this.ROOT_FOLDER_ID, jsonData.userClippingsRoot, aReplaceShortcutKeys, aShortcutKeyLookup, aAppendItems);
      });
    },
    
    _importFromRDFHelper(aDataSrc, aRDFFolderNode)
    {
      let rv = [];
      let folderItems = aDataSrc.statementsMatching(aRDFFolderNode);
      
      for (let i = 0; i < folderItems.length; i++) {
        if (folderItems[i].object.value != this.RDF_SEQ) {
          let itemURI = folderItems[i].object.value;
          let item = aDataSrc.each($rdf.sym(itemURI));
          let cnvItem = {};

          if (item.length == 0) {
            continue;
          }
          
          let itemType = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(aDataSrc.namespaces.RDF + "type")).value;

          this._log(`[${i}]: Item type: "${itemType}"`);

          if (itemType == this.CLIPPINGS_RDF_NS + "null") {
            this._log("Skipping null clipping in empty folder.");
            continue;
          }
          else if (itemType == this.RDF_SEQ) {
            let folderName = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(this.CLIPPINGS_RDF_NS + "name")).value;

            this._info("Folder name: " + folderName);

            cnvItem = {
              name: folderName,
              children: []
            };
            
            cnvItem.children = this._importFromRDFHelper(aDataSrc, $rdf.sym(itemURI));
          }
          else if (itemType == this.CLIPPINGS_RDF_NS + "clipping") {
            let clippingName = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(this.CLIPPINGS_RDF_NS + "name")).value;
            let content = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(this.CLIPPINGS_RDF_NS + "text")).value;

            let debugMsg = `Clipping name: ${clippingName}\nContent: ${content}`;

            let shortcutKey = "";
            try {
              shortcutKey = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(this.CLIPPINGS_RDF_NS + "key")).value;
            }
            catch (e) {}
            if (shortcutKey) {
              debugMsg += `\nShortcut key: '${shortcutKey}'`;
            }

            let sourceURL = "";
            try {
              sourceURL = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(this.CLIPPINGS_RDF_NS + "srcurl")).value;
            }
            catch (e) {}
            if (sourceURL) {
              debugMsg += `\nSource URL: ${sourceURL}`;
            }
            
            let label = "";
            try {
              label = aDataSrc.any($rdf.sym(itemURI), $rdf.sym(this.CLIPPINGS_RDF_NS + "label")).value;
            }
            catch (e) {}
            if (label) {
              debugMsg += `\nLabel: ${label}`;
            }

            cnvItem = { name: clippingName, content, shortcutKey, sourceURL, label };

            this._log(debugMsg);
          }
          
          rv.push(cnvItem);
        }
      }
      return rv;
    },
    
    getShortcutKeyListHTML(aIsFullHTMLDoc)
    {
      let rv = "";
      let htmlSrc = "";

      if (aIsFullHTMLDoc) {
        htmlSrc += `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${_shctTitle}</title></head>
<body>
<h1>${_shctTitle}</h1>
<p class="app-info" style="font-size:small">${_hostAppInfo}</p>
<p>${_shctKeyInstrxns}
<em>${_shctKeyCustNote}</em></p>
<table border="2">`;
      }
      else {
        htmlSrc += "<table>";
      }
      htmlSrc += `<thead><tr><th>${_shctKeyColHdr}</th><th>${_clipNameColHdr}</th></tr></thead><tbody>`;

      return new Promise((aFnResolve, aFnReject) => {
        this._getShortcutKeyMap().then(aShctKeyMap => {
          for (let shctKey in aShctKeyMap) {
            if (aIsFullHTMLDoc) {
              htmlSrc += "<tr>";
            }
            else {
              htmlSrc += `<tr data-id="${aShctKeyMap[shctKey].id}">`;
            }
            htmlSrc += `<td>${shctKey}</td><td>${this._escapeHTML(aShctKeyMap[shctKey].name)}</td></tr>\n`;
          }

          htmlSrc += "</tbody></table>";
          if (aIsFullHTMLDoc) {
            htmlSrc += "\n</body></html>";
          }

          rv = htmlSrc;
          aFnResolve(rv);
        });
      });
    },

    _getShortcutKeysToClippingIDs()
    {
      let rv = {};

      return new Promise((aFnResolve, aFnReject) => {
        _db.clippings.where("shortcutKey").notEqual("").each((aItem, aCursor) => {
          rv[aItem.shortcutKey] = aItem.id;

        }).then(() => {
          aFnResolve(rv);
        });
      });
    },

    _getShortcutKeyMap()
    {
      let rv = {};
      
      return new Promise((aFnResolve, aFnReject) => {
        _db.clippings.where("shortcutKey").notEqual("").each((aItem, aCursor) => {
          rv[aItem.shortcutKey] = {
            id: aItem.id,
            name: aItem.name
          };
          
        }).then(() => {
          aFnResolve(rv);
        });
      });
    },

    _escapeHTML(aStr)
    {
      let rv = aStr.replace(/</g, "&lt;");
      rv = rv.replace(/>/g, "&gt;");

      return rv;
    },


    //
    // Debug log output
    //

    _log(aMessage)
    {
      if (this.DEBUG) { console.log(aMessage); }
    },

    _info(aMessage)
    {
      if (this.DEBUG) { console.info(aMessage); }
    },

    _warn(aMessage)
    {
      if (this.DEBUG) { console.warn(aMessage); }
    }
  };
}();
