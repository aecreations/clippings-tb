/* -*- mode: JavaScript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeClippingsService"];

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/osfile.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;


let aeClippingsService = {
  _instance: null,
  
  getService()
  {
    if (! this._instance) {
      this._instance = new aeClippingsServiceImpl();
    }
    return this._instance;
  }
};


function aeClippingsServiceImpl() {}

aeClippingsServiceImpl.prototype = {
  // Public constants
  FILETYPE_RDF_XML: 0,
  FILETYPE_CLIPPINGS_1X: 1,
  FILETYPE_CSV: 2,
  FILETYPE_WX_JSON: 3,

  ORIGIN_CLIPPINGS_MGR: 1,
  ORIGIN_HOSTAPP: 2,
  ORIGIN_NEW_CLIPPING_DLG: 3,

  IMPORT_REPLACE_CURRENT:  1,
  IMPORT_KEEP_CURRENT:     2,

  LABEL_NONE:   "",
  LABEL_RED:    "red",
  LABEL_ORANGE: "orange",
  LABEL_YELLOW: "yellow",
  LABEL_GREEN:  "green",
  LABEL_BLUE:   "blue",
  LABEL_PURPLE: "purple",
  LABEL_GREY:   "grey",

  MAX_NAME_LENGTH:        64,

  // Private constants.
  _DEBUG:  true,
  _TEST_CORRUPTION: false,
  _SEQNODE_RESOURCE_URI:  "http://clippings.mozdev.org/rdf/user-clippings-v2",
  _OLD_SEQNODE_RESOURCE_URI: "http://clippings.mozdev.org/rdf/user-clippings",
  _SYNCED_CLIPPINGS_FOLDER_URI: "http://clippings.mozdev.org/ns/rdf#wx-sync",
  _PREDNAME_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#name",
  _PREDTEXT_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#text",
  _PREDKEY_RESOURCE_URI:  "http://clippings.mozdev.org/ns/rdf#key",
  _PREDSRCURL_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#srcurl",
  _PREDLABEL_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#label",
  _PREDHASSUBFOLDERS_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#hassubfolders",
  _PREDTYPE_RESOURCE_URI: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  _RDFTYPE_FOLDER_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#folder",
  _RDFTYPE_CLIPPING_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#clipping",
  _RDFTYPE_NULL_RESOURCE_URI: "http://clippings.mozdev.org/ns/rdf#null",
  _RDF_SEQ_URI: "http://www.w3.org/1999/02/22-rdf-syntax-ns#Seq",
  _BACKUP_FILE_PREFIX:    "clippings_",
  _BACKUP_FILE_EXTENSION: ".rdf",
  _WX_SYNC_FILENAME: "clippings-sync.json",
  _WX_COPY_FILENAME: "clippings.json",

  _CLIPPINGS_HTML_NS: "http://clippings.mozdev.org/ns/html#",

  _JSON_EXPORT_VER: "6.0",
  _JSON_EXPORT_CREATED_BY: "Clippings for Thunderbird 5.6+",

  // Private member variables
  _dataSrc: null,
  _rdfSvc:  Components.classes["@mozilla.org/rdf/rdf-service;1"]
                      .getService(Components.interfaces.nsIRDFService),
  _rdfContainerUtils: Components.classes["@mozilla.org/rdf/container-utils;1"].getService(Components.interfaces.nsIRDFContainerUtils),
  _rdfContainer:        null,
  _dsFileURL:        "",
  _backupDirURL:     "",
  _syncDirURL:       "",
  _maxBackupFiles:   10,
  _emptyClippingStr: "(Empty)",
  _listeners:        [],
  _detachedItems:    [],
  _count:            -1,
  _syncedClippings:  false,
  _syncedClippingsFldrName: "Synced Clippings",

  // Getters
  get kRootFolderURI()
  {
    return this._SEQNODE_RESOURCE_URI;
  },

  get kSyncFolderURI()
  {
    return this._SYNCED_CLIPPINGS_FOLDER_URI;
  },

  get dataSourceURL()
  {
    return this._dsFileURL;
  },

  get numItems() 
  {
    var rv;
    if (this._rdfContainer) {
      if (this._count == -1) {
	this._count = this._countRec(this._rdfContainer);
      }
      rv = this._count;
    }
    return rv;
  }
};


aeClippingsServiceImpl.prototype.addListener = function (aNewListener)
{
  this._listeners.push(aNewListener);
  this._log("Added listener object to aeIClippingsService.  There are now " + this._listeners.length + " listeners.");
};


aeClippingsServiceImpl.prototype.removeListener = function (aTargetListener)
{
  for (let i = 0; i < this._listeners.length; i++) {
    if (this._listeners[i] && this._listeners[i] == aTargetListener) {
      delete this._listeners[i];
      this._log("Removed listener object " + i + " from aeIClippingsService");
      break;
    }
  }
};


aeClippingsServiceImpl.prototype.getDataSource = function (aDataSrcURL)
{
  if (this._dataSrc) {
    return this._dataSrc;
  }

  this._dsFileURL = aDataSrcURL;

  try {
    // If Clippings data file doesn't exist, it will be created automatically.
    this._dataSrc = this._rdfSvc.GetDataSourceBlocking(aDataSrcURL);
  }
  catch (e) {
    this._log(e);
    throw e;
  }

  var seqNode = this._rdfSvc.GetResource(this._SEQNODE_RESOURCE_URI);
  
  // MakeSeq will create a new <RDF:Seq> if it doesn't already exist.
  // If it does, it just initializes it
  this._rdfContainer = this._rdfContainerUtils.MakeSeq(this._dataSrc, seqNode);
  this._rdfContainer = this._rdfContainer.QueryInterface(Components.interfaces.nsIRDFContainer);

  if (this._count == -1) {
    this._count = this._countRec(this._rdfContainer);
  }

  this._log("aeClippingsService.getDataSource(): Initialization complete.  Datasource URL: \"" + aDataSrcURL + "\"; " + this._count + " item(s) in root folder");
  return this._dataSrc;
};


aeClippingsServiceImpl.prototype.reset = function ()
{
  this.purgeDetachedItems();

  this._dataSrc = null;
  this._rdfContainer = null;
  this._dsFileURL = "";
  this._count = -1;
  this._syncedClippings = false;
};


aeClippingsServiceImpl.prototype.setBackupDir = function (aBackupDirURL)
{
  this._backupDirURL = aBackupDirURL;
};


aeClippingsServiceImpl.prototype.getBackupDir = function ()
{
  this._log("Clippings backup location (URL): " + this._backupDirURL);
  let rv = this._getFileFromURL(this._backupDirURL);
  return rv;
};


aeClippingsServiceImpl.prototype.setMaxBackupFiles = function (aNumFiles)
{
  this._maxBackupFiles = aNumFiles;
};


aeClippingsServiceImpl.prototype.createClippingNameFromText = function (aText)
{
  var rv = "";
  var clipName = "";

  if (aText.length > this.MAX_NAME_LENGTH) {
    // Leave room for the three-character elipsis.
    clipName = this._strtrm(aText).substr(0, this.MAX_NAME_LENGTH - 3) + "...";
  } 
  else {
    clipName = this._strtrm(aText);
  }

  // Truncate clipping names at newlines if they exist.
  let newlineIdx = clipName.indexOf("\n");
  rv = (newlineIdx == -1) ? clipName : clipName.substring(0, newlineIdx);

  return rv;
};


aeClippingsServiceImpl.prototype.createNewClipping = function (aParentFolder, aName, aText, aSourceURL, aLabel, aDontNotify, aDataSrc)
  // aDataSrc param for internal use only - not exposed in interface (needed
  // for exporting)
{
  var newNode = this._rdfSvc.GetAnonymousResource();
  this._createNewClippingHelper(aParentFolder, newNode, aName, aText, aSourceURL, aLabel, null, aDontNotify, aDataSrc);
  return newNode.Value;  // URI of new RDF node
};


aeClippingsServiceImpl.prototype.createNewClippingEx = function (aParentFolder, aURI, aName, aText, aSourceURL, aLabel, aPos, aDontNotify)
{
  var rv;
  var newNode;
  if (aURI) {
    newNode = this._rdfSvc.GetResource(aURI);
    rv = aURI;
  }
  else {
    newNode = this._rdfSvc.GetAnonymousResource();
    rv = newNode.Value;
  }

  this._createNewClippingHelper(aParentFolder, newNode, aName, aText, aSourceURL, aLabel, aPos, aDontNotify);
  return rv;
};


aeClippingsServiceImpl.prototype._createNewClippingHelper = function (aParentFolderURI, aNode, aName, aText, aSourceURL, aLabel, aPos, aDontNotify, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var name = this._sanitize(aName);
  var text = this._sanitize(aText || "");
  var srcURL = this._sanitize(aSourceURL || "");

  var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
  var predText = this._rdfSvc.GetResource(this._PREDTEXT_RESOURCE_URI);
  var predSrcURL = this._rdfSvc.GetResource(this._PREDSRCURL_RESOURCE_URI);
  var predLabel = this._rdfSvc.GetResource(this._PREDLABEL_RESOURCE_URI);
  var predType = this._rdfSvc.GetResource(this._PREDTYPE_RESOURCE_URI);
  var targName = this._rdfSvc.GetLiteral(name);
  var targText = this._rdfSvc.GetLiteral(text);
  var targSrcURL = this._rdfSvc.GetLiteral(srcURL);
  var targLabel = this._rdfSvc.GetLiteral(aLabel);
  var targType = this._rdfSvc.GetResource(this._RDFTYPE_CLIPPING_RESOURCE_URI);

  ds.Assert(aNode, predName, targName, true);
  ds.Assert(aNode, predText, targText, true);
  ds.Assert(aNode, predSrcURL, targSrcURL, true);
  ds.Assert(aNode, predLabel, targLabel, true);
  ds.Assert(aNode, predType, targType, true);

  var parentFolderCtr = this._getSeqContainerFromFolder(aParentFolderURI, ds);

  if (aPos) {
    try {
      parentFolderCtr.InsertElementAt(aNode, aPos, true);
    } catch (e) {
      throw Components.Exception("**ERROR: aNode=" + aNode + "; aPos=" + aPos + "\n" + e);
    }
  }
  else {
    try {
      parentFolderCtr.AppendElement(aNode);
    }
    catch (e) {
      // Exception thrown if the datasource is empty AND common clippings
      // are enabled.
    }
  }

  if (ds == this._dataSrc) {
    this._count++;

    // Get rid of the dummy item that would be present in the folder if it was
    // empty before this new clipping was added to it.
    this._removeDummyNode(aParentFolderURI, ds);

    this._log("aeClippingsService._createNewClippingHelper(): Created a new clipping!  Name: " + name + ", text: " + text + ", source URL: " + srcURL + ", label: " + aLabel);

    // Notify all observers
    if (! aDontNotify) {
      for (let i = 0; i < this._listeners.length; i++) {
	if (this._listeners[i]) {
	  this._log("aeClippingsService._createNewClippingHelper(): Notifying observer " + i);
	  this._listeners[i].newClippingCreated(aNode.Value);
	}
      }
    }
  }
};


aeClippingsServiceImpl.prototype.createNewFolder = function (aParentFolder, aName, aDontNotify, aDataSrc)
  // aDataSrc param for internal use only - not exposed in interface (needed
  // for exporting)
{
  var newNode = this._rdfSvc.GetAnonymousResource();
  this._createNewFolderHelper(aParentFolder, newNode, aName, null, aDontNotify, null, aDataSrc);
  return newNode.Value;  // URI of new RDF node
};


aeClippingsServiceImpl.prototype.createNewFolderEx = function (aParentFolder, aURI, aName, aPos, aDontNotify, aOrigin)
{
  var rv;
  var newNode;
  if (aURI) {
    newNode = this._rdfSvc.GetResource(aURI);
    rv = aURI;
  }
  else {
    newNode = this._rdfSvc.GetAnonymousResource();
    rv = newNode.Value;
  }

  this._createNewFolderHelper(aParentFolder, newNode, aName, aPos, aDontNotify, aOrigin, null);
  return rv;
};


aeClippingsServiceImpl.prototype._createNewFolderHelper = function (aParentFolderURI, aNode, aName, aPos, aDontNotify, aOrigin, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var name = this._sanitize(aName);

  // Add triples to the folder node with `name' and `type' predicates.
  var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
  var predType = this._rdfSvc.GetResource(this._PREDTYPE_RESOURCE_URI);
  var targName = this._rdfSvc.GetLiteral(name);
  var targType = this._rdfSvc.GetResource(this._RDFTYPE_FOLDER_RESOURCE_URI);
  ds.Assert(aNode, predName, targName, true);
  ds.Assert(aNode, predType, targType, true);

  // Add a triple indicating whether or not this folder has any subfolders.
  // This is needed for generating the folder submenu for Move To and Copy To
  // commands in Clippings Manager.
  var predHasSubf = this._rdfSvc.GetResource(this._PREDHASSUBFOLDERS_RESOURCE_URI);
  var targHasSubf = this._rdfSvc.GetLiteral("false");
  ds.Assert(aNode, predHasSubf, targHasSubf, true);

  var prevSubfCount = this.getCountSubfolders(aParentFolderURI, ds);

  // Append the folder to the parent folder.
  var parentFolderCtr = this._getSeqContainerFromFolder(aParentFolderURI, ds);

  if (aPos) {
    try {
      parentFolderCtr.InsertElementAt(aNode, aPos, true);
    } catch (e) {
      throw Components.Exception("**ERROR: aNode=" + aNode + "; aPos=" + aPos + "\n" + e);
    }
  }
  else {
    parentFolderCtr.AppendElement(aNode);
  }

  // Make the folder node an <rdf:Seq> container.
  var folderCtr = this._rdfContainerUtils.MakeSeq(ds, aNode);

  // Update the "has subfolders" triple of the parent folder.
  if (prevSubfCount == 0) {
    this._setHasSubfoldersTriple(aParentFolderURI, true, ds);
  }

  if (ds == this._dataSrc) {
    this._count++;

    aNode = aNode.QueryInterface(Components.interfaces.nsIRDFResource);
    var newFolderURI = aNode.Value;

    // Get rid of dummy item if it already exists for this folder - this would
    // happen if this folder was deleted before and is being recreated by a
    // Undo Undo command
    this._removeDummyNode(newFolderURI, ds);
    this._appendDummyNode(newFolderURI, ds);

    // Get rid of the dummy item in the parent folder if it exists.
    this._removeDummyNode(aParentFolderURI, ds);

    // Notify all observers, except the one that is creating the folder.
    if (! aDontNotify) {
      for (let i = 0; i < this._listeners.length; i++) {
	if (this._listeners[i] && this._listeners[i].origin != aOrigin) {
	  this._log("aeClippingsService._createNewFolderHelper(): Notifying observer " + i);
	  this._listeners[i].newFolderCreated(aNode.Value);
	}
      }
    }
  }
};



aeClippingsServiceImpl.prototype._getSeqContainerFromFolder = function (aURI, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;

  // Don't need to do anything special if folder is root
  if (aURI == this.kRootFolderURI) {
    if (! aDataSrc) {
      return this._rdfContainer;
    }
  }

  var seqNode = this._rdfSvc.GetResource(aURI);
  var container = this._rdfContainerUtils.MakeSeq(ds, seqNode);
  container = container.QueryInterface(Components.interfaces.nsIRDFContainer);

  return container;
};


aeClippingsServiceImpl.prototype.createEmptyClipping = function (aFolderURI)
{
  if (! this.isFolder(aFolderURI)) {
    throw Components.Exception("aeClippingsService.createEmptyClipping(): URI argument is not a folder resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  this._appendDummyNode(aFolderURI);
};


aeClippingsServiceImpl.prototype.processRootFolder = function ()
{
  if (! this._rdfContainer) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (this.getCount(this.kRootFolderURI) == 0) {
    this._appendDummyNode(this.kRootFolderURI);
    this.flushDataSrc(true);
  }
};


aeClippingsServiceImpl.prototype.removeAllSourceURLs = function ()
{
  if (! this._rdfContainer) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }
  this._removeAllSrcURLs(this._rdfContainer);
};


aeClippingsServiceImpl.prototype._removeAllSrcURLs = function (aFolderCtr)
{
  var childrenEnum = aFolderCtr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    var child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    var childURI = child.Value;

    if (this.isClipping(childURI) && this.hasSourceURL(childURI)) {
      var predSrcURL = this._rdfSvc.GetResource(this._PREDSRCURL_RESOURCE_URI);
      var targSrcURL = this._dataSrc.GetTarget(child, predSrcURL, true);
      this._dataSrc.Unassert(child, predSrcURL, targSrcURL);
    }
    else if (this.isFolder(childURI)) {
      var folderCtr = this._getSeqContainerFromFolder(childURI);
      this._removeAllSrcURLs(folderCtr);
    }
  }
};


aeClippingsServiceImpl.prototype.processEmptyFolders = function ()
{
  if (! this._rdfContainer) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }
  this._processEmptyFolders(this._rdfContainer);
};


aeClippingsServiceImpl.prototype._processEmptyFolders = function (aFolderCtr)
{
  var childrenEnum = aFolderCtr.GetElements();
  while (childrenEnum.hasMoreElements()) {
    var child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    var childURI = child.Value;

    if (this.isFolder(childURI)) {
      if (this.getCount(childURI) == 0) {
	this._appendDummyNode(childURI);
	this._log("Empty clipping appended to folder \"" + this.getName(childURI) + "\"");
      }
      else {
	var folderCtr = this._getSeqContainerFromFolder(childURI);
	this._processEmptyFolders(folderCtr);
      }
    }
  }
};


aeClippingsServiceImpl.prototype._appendDummyNode = function (aFolderURI, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;

  var folderCtr = this._getSeqContainerFromFolder(aFolderURI, ds);
  var dummyNode = this._rdfSvc.GetAnonymousResource();
  var predType = this._rdfSvc.GetResource(this._PREDTYPE_RESOURCE_URI);
  var targType = this._rdfSvc.GetResource(this._RDFTYPE_NULL_RESOURCE_URI);

  var predDummy = this._rdfSvc.GetResource("http://clippings.mozdev.org/ns/rdf#dummy_flag");
  var targDummy = this._rdfSvc.GetLiteral("dummy");
  var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
  var targName = this._rdfSvc.GetLiteral(this._emptyClippingStr);

  ds.Assert(dummyNode, predType, targType, true);
  ds.Assert(dummyNode, predDummy, targDummy, true);
  ds.Assert(dummyNode, predName, targName, true);
  folderCtr.AppendElement(dummyNode);
};


aeClippingsServiceImpl.prototype._removeDummyNode = function (aFolderURI, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;

  var ctr = this._getSeqContainerFromFolder(aFolderURI, ds);
  var childrenEnum = ctr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;
    if (this._isDummyNode(childURI, ds)) {

      // Unassert all assertions on this node, then remove it from its parent
      // container; this ensures the node is removed from the datasource.
      let predsEnum = ds.ArcLabelsOut(child);
      while (predsEnum.hasMoreElements()) {
	let pred = predsEnum.getNext();
	pred = pred.QueryInterface(Components.interfaces.nsIRDFResource);
	let targ = ds.GetTarget(child, pred, true);
	ds.Unassert(child, pred, targ);
      }

      ctr.RemoveElement(child, false);
    }
  }
};


aeClippingsServiceImpl.prototype.setEmptyClippingString = function (aString)
{
  this._emptyClippingStr = aString;
};


aeClippingsServiceImpl.prototype.getCount = function (aFolderURI)
{
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!this.isFolder(aFolderURI) && aFolderURI != this.kRootFolderURI) {
    throw Components.Exception("aeClippingsService.getCount(): URI argument is not a folder resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  let ctr = this._getSeqContainerFromFolder(aFolderURI);
  let e, i;

  // Running time is O(n) - we need to do better than this!
  for (e = ctr.GetElements(), i = 0; e.hasMoreElements(); e.getNext(), ++i);

  return i;
};


aeClippingsServiceImpl.prototype.getCountSubfolders = function (aFolderURI, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!this.isFolder(aFolderURI, ds) && aFolderURI != this.kRootFolderURI) {
    throw Components.Exception("aeClippingsService.getCountSubfolders(): URI argument is not a folder resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv;
  var container = this._getSeqContainerFromFolder(aFolderURI, ds);
  var childrenEnum = container.GetElements();
  var numSubfolders = 0;

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;
    if (this.isFolder(childURI, ds)) {
      numSubfolders++;
    }
  }

  rv = numSubfolders;
  return rv;
};


aeClippingsServiceImpl.prototype.recountAll = function ()
{
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var rv = 0;
  rv = this._count = this._countRec(this._rdfContainer);

  return rv;
};


aeClippingsServiceImpl.prototype._countRec = function (aFolderCtr)
{
  var count = 0;
  var childrenEnum = aFolderCtr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;
    if (this.isFolder(childURI)) {
      let subfolderCtr = this._getSeqContainerFromFolder(childURI);
      count += this._countRec(subfolderCtr);
    }
    if (! this.isEmptyClipping(childURI)) {
      count++;
    }
  }

  return count;
};


aeClippingsServiceImpl.prototype.findByName = function (aSearchText, aMatchCase, aSearchFolders)
{
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var reFlags = aMatchCase ? "" : "i";
  var regExp = new RegExp(aSearchText, reFlags);
  var rv = [];
  rv = this._findRec(regExp, this._rdfContainer, aSearchFolders);

  return rv;
};


aeClippingsServiceImpl.prototype._findRec = function (aRegExp, aFolderCtr, aSearchFolders)
{
  var srchResults = [];
  var childrenEnum = aFolderCtr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;
    if (this.isFolder(childURI)) {
      if (aSearchFolders) {
        let folderName = this.getName(childURI);
        if (folderName.search(aRegExp) != -1) {
          srchResults.push(childURI);
        }
      }
      
      let subfolderCtr = this._getSeqContainerFromFolder(childURI);
      let subfolderSrchResults = this._findRec(aRegExp, subfolderCtr, aSearchFolders);
      srchResults = srchResults.concat(subfolderSrchResults);
    }
    if (this.isClipping(childURI)) {
      let clippingName = this.getName(childURI);
      if (clippingName.search(aRegExp) != -1) {
        srchResults.push(childURI);
      }
    }
  }

  return srchResults;
};


aeClippingsServiceImpl.prototype.getParent = function (aURI)
{
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (aURI == this.kRootFolderURI) {
    return "";
  }

  var rv;
  var subject, predicate;
  var target = this._rdfSvc.GetResource(aURI);
  var predsEnum = this._dataSrc.ArcLabelsIn(target);
  while (predsEnum.hasMoreElements()) {
    let pred = predsEnum.getNext();
    pred = pred.QueryInterface(Components.interfaces.nsIRDFResource);
    predicate = pred;
    break;
  }

  if (! predicate) {
    let name = this.getName(aURI);
    throw Components.Exception("aeClippingsService.getParent(): Failed to get predicate of resource\nURI: \"" + aURI + "\"; name: \"" + name + "\"");
  }

  subject = this._dataSrc.GetSource(predicate, target, true);
  if (subject instanceof Components.interfaces.nsIRDFResource) {
    rv = subject.Value;
  }
  return rv;
};


aeClippingsServiceImpl.prototype.isFolder = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var rv = false;
  var subjType = this._rdfSvc.GetResource(aURI);
  var predType = this._rdfSvc.GetResource(this._PREDTYPE_RESOURCE_URI);
  var targType = ds.GetTarget(subjType, predType, true);
  if (targType instanceof Components.interfaces.nsIRDFResource) {
    rv = (targType.Value == this._RDFTYPE_FOLDER_RESOURCE_URI);
  }
  return rv;
};


aeClippingsServiceImpl.prototype.isClipping = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var rv = false;
  var subjType = this._rdfSvc.GetResource(aURI);
  var predType = this._rdfSvc.GetResource(this._PREDTYPE_RESOURCE_URI);
  var targType = ds.GetTarget(subjType, predType, true);
  if (targType instanceof Components.interfaces.nsIRDFResource) {
    rv = (targType.Value == this._RDFTYPE_CLIPPING_RESOURCE_URI);
  }
  return rv;
};


aeClippingsServiceImpl.prototype.isEmptyClipping = function (aURI)
{
  return this._isDummyNode(aURI);
};


aeClippingsServiceImpl.prototype._isDummyNode = function (aURI, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var rv = false;
  var subjType = this._rdfSvc.GetResource(aURI);
  var predType = this._rdfSvc.GetResource(this._PREDTYPE_RESOURCE_URI);
  var targType = ds.GetTarget(subjType, predType, true);
  if (targType instanceof Components.interfaces.nsIRDFResource) {
    rv = (targType.Value == this._RDFTYPE_NULL_RESOURCE_URI);
  }
  return rv;
};


// aDataSrc parameter used internally - not exposed in interface
aeClippingsServiceImpl.prototype.getShortcutKey = function (aURI, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("aeClippingsService.getShortcutKey(): Data source not initialized", Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.getShortcutKey(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.getShortcutKey(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv = "";
  var subjKey = this._rdfSvc.GetResource(aURI);
  var predKey = this._rdfSvc.GetResource(this._PREDKEY_RESOURCE_URI);
  var targKey = ds.GetTarget(subjKey, predKey, true);

  if (targKey instanceof Components.interfaces.nsIRDFLiteral) {
    rv = targKey.Value;
  }

  return rv;
};


// aDataSrc parameter used internally - not exposed in interface
aeClippingsServiceImpl.prototype.setShortcutKey = function (aURI, aKey, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("aeClippingsService.setShortcutKey(): Data source not initialized", Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI, ds)) {
    throw Components.Exception("aeClippingsService.setShortcutKey(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.setShortcutKey(): URI argument is not a clipping resource",  Components.results.NS_ERROR_INVALID_ARG);
  }

  var key = this._sanitize(aKey);

  // Check if this key has already been defined for another clipping.
  if (! aDataSrc) {
    let keyMap = this._createShortcutKeyMap(this._rdfContainer);
    if (keyMap[key]) {
      throw Components.Exception("aeClippingsService.setShortcutKey(): Key already defined: `" + key + "'", Components.results.NS_ERROR_FAILURE);
    }
  }

  var subjKey = this._rdfSvc.GetResource(aURI);
  var predKey = this._rdfSvc.GetResource(this._PREDKEY_RESOURCE_URI);
  var targOldKey = ds.GetTarget(subjKey, predKey, true);
  var targNewKey = this._rdfSvc.GetLiteral(key);

  if (! targOldKey) {
    // No shortcut key was assigned
    ds.Assert(subjKey, predKey, targNewKey, true);
  }
  else {
    // Shortcut key already assigned - we want to change it
    // Empty/null aKey parameter removes the key assignment from the clipping
    if (! key) {
      ds.Unassert(subjKey, predKey, targOldKey);
    }
    else {
      ds.Change(subjKey, predKey, targOldKey, targNewKey);
    }
  }
};


aeClippingsServiceImpl.prototype.getShortcutKeyMap = function ()
{
  // Returns a Map object which maps shortcut keys to the URIs
  // of clippings having that shortcut key assigned.
  if (! this._dataSrc) {
    throw Components.Exception("aeClippingsService.getShortcutKeyMap(): Data source not initialized", Components.results.NS_ERROR_NOT_INITIALIZED);
  }
  
  let rv = new Map();
  let keyMap = this._createShortcutKeyMap(this._rdfContainer);

  for (let key in keyMap) {
    rv.set(key, keyMap[key]);
  }

  return rv;
};


aeClippingsServiceImpl.prototype._createShortcutKeyMap = function (aFolderCtr)
{
  var rv = {};
  var childrenEnum = aFolderCtr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;

    if (this.isClipping(childURI)) {
      let key = this.getShortcutKey(childURI);
      if (key) {
	rv[key] = childURI;
      }
    }
    else if (this.isFolder(childURI)) {
      let folderCtr = this._getSeqContainerFromFolder(childURI);
      rv = this._combineJSMap(rv, this._createShortcutKeyMap(folderCtr));
    }
  }

  return rv;
};


aeClippingsServiceImpl.prototype._combineJSMap = function (a, b)
{
  // Paremeters a and b are JavaScript objects
  var rv = {};
  for (let i in a) {
    rv[i] = a[i];
  }

  for (let j in b) {
    rv[j] = b[j];
  }

  return rv;
};


aeClippingsServiceImpl.prototype.copyTo = function (aURI, aDestFolder, aDestItemURI, aDestPos, aRemoveOriginal, aOrigin)
{
  if (! this._dataSrc) {
    throw Components.Exception("aeClippingsService.copyTo(): Data source not initialized", Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  // Allow copying items to the same folder to create copies of items.
  // But disallow moving items into the same folder.
  try {
    var parentFolderURI = this.getParent(aURI);
  }
  catch (e) {
    throw Components.Exception("aeClippingsService.copyTo(): Unable to retrieve parent folder URI of item to move or copy!\n" + e);
  }

  if (parentFolderURI == aDestFolder && aRemoveOriginal) {
    throw Components.Exception("Source and destination folders are the same!");
  }

  var rv;
  var isFolderMovedOrCopied;
  var name = this.getName(aURI);

  if (this.isClipping(aURI)) {
    var text = this.getText(aURI);
    var srcURL = this.getSourceURL(aURI);
    var label = this.getLabel(aURI);
    rv = this.createNewClippingEx(aDestFolder, aDestItemURI, name, text, srcURL, label, aDestPos, true);

    // A clipping that is moved should preserve its shortcut key, if defined.
    var key;
    if (aRemoveOriginal && (key = this.getShortcutKey(aURI))) {
      try {
	this.setShortcutKey(aURI, "");
	this.setShortcutKey(rv, key);
      } 
      catch (e) {
	this._log("aeClippingsService.copyTo(): Unable to set shortcut key:\n" + e);
      }
    }
  }
  else if (this.isFolder(aURI)) {
    if (aURI == aDestFolder && aRemoveOriginal) {
      throw Components.Exception("aeClippingsService.copyTo(): Cannot move a folder into itself!");
    }

    isFolderMovedOrCopied = true;

    // HACK!!  Must notify host app window of the new folder creation so that
    // it can rebuild the Clippings submenu.
    var copiedFolderURI;
    copiedFolderURI = this.createNewFolderEx(aDestFolder, aDestItemURI, name, aDestPos, false, aOrigin);
    var folderCtr = this._getSeqContainerFromFolder(aURI);
    var childrenEnum = folderCtr.GetElements();

    while (childrenEnum.hasMoreElements()) {
      let child = childrenEnum.getNext();
      child = child.QueryInterface(Components.interfaces.nsIRDFResource);
      let childURI = child.Value;
      if (childURI != copiedFolderURI) {  // Avoid unwanted infinite recursion.
	this.copyTo(childURI, copiedFolderURI, null, null, false);
      }
    }
    rv = copiedFolderURI;

  }

  if (aRemoveOriginal) {
    this.remove(aURI, false, true);
    if (this.getCount(parentFolderURI) == 0) {
      this._appendDummyNode(parentFolderURI);
    }
  }

  return rv;
};


aeClippingsServiceImpl.prototype.removeAll = function ()
{
  var childrenEnum = this._rdfContainer.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;
    this.remove(childURI, true, true);
  }

  this.purgeDetachedItems();
  this._appendDummyNode(this._SEQNODE_RESOURCE_URI);
  this.recountAll();

  this._log("aeClippingsService.removeAll(): Finished removing all clippings and folders. There are now " + this._count + " items.");
};


// aDontUpdateCount and aPurgeFlag params for internal use only - 
// not exposed in interface.
aeClippingsServiceImpl.prototype.remove = function (aURI, aDontUpdateCount, aPurgeFlag)
{
  this._log("aeClippingsService.remove(): URI of item to be removed: " + aURI);
  
  var subjectNode = this._rdfSvc.GetResource(aURI);
  var name = this.getName(aURI) || "(no name)";
  var isFolderBeingDeleted = false;
  var parentFolderURI = this.getParent(aURI);

  if (this.isClipping(aURI)) {
    this._log("Removing clipping: \"" + name + "\"");
  }
  else if (this.isFolder(aURI)) {
    isFolderBeingDeleted = true;
    this._log("Removing folder: \"" + name + "\"");

    if (this.getCount(aURI) > 0) {
      var folderCtr = this._getSeqContainerFromFolder(aURI);
      var childrenEnum = folderCtr.GetElements();

      while (childrenEnum.hasMoreElements()) {
	let child = childrenEnum.getNext();
	child = child.QueryInterface(Components.interfaces.nsIRDFResource);
	let childURI = child.Value;
	this.remove(childURI, aDontUpdateCount, aPurgeFlag);
      }
    }
  }

  var predsEnum = this._dataSrc.ArcLabelsOut(subjectNode);
  while (predsEnum.hasMoreElements()) {
    let pred = predsEnum.getNext();
    pred = pred.QueryInterface(Components.interfaces.nsIRDFResource);
    let targ = this._dataSrc.GetTarget(subjectNode, pred, true);
    this._dataSrc.Unassert(subjectNode, pred, targ);
  }

  // Do not renumber child elements; otherwise removing a folder will leave
  // behind one child.
  var parentCtr = this._getSeqContainerFromFolder(parentFolderURI);
  parentCtr.RemoveElement(subjectNode, false);
  this._log("Item \"" + name + "\" has been removed.");

  if (isFolderBeingDeleted) {
    var numSubfolders = this.getCountSubfolders(parentFolderURI);
    if (numSubfolders == 0) {
      this._setHasSubfoldersTriple(parentFolderURI, false);
    }
  }

  var numItemsInFolder = this.getCount(parentFolderURI);
  if (!aPurgeFlag && numItemsInFolder == 0) {
    this._appendDummyNode(parentFolderURI);
  }

  if (! aDontUpdateCount) {
    this._count = this._countRec(this._rdfContainer);
  }
};


aeClippingsServiceImpl.prototype._setHasSubfoldersTriple = function (aFolderURI, aBoolFlag, aDataSrc)
{
  var ds = aDataSrc || this._dataSrc;

  // Do not do this for the Clippings root folder!
  if (aFolderURI == this.kRootFolderURI) {
    return;
  }

  var folderNode = this._rdfSvc.GetResource(aFolderURI);
  var predHasSubf = this._rdfSvc.GetResource(this._PREDHASSUBFOLDERS_RESOURCE_URI);
  var targNewVal = this._rdfSvc.GetLiteral(aBoolFlag.toString());
  var targOldVal = ds.GetTarget(folderNode, predHasSubf, true);
  ds.Change(folderNode, predHasSubf, targOldVal, targNewVal, true);
};


// Returns the 1-based index of the item being detached.
aeClippingsServiceImpl.prototype.detachFromFolder = function (aFolderURI)
{
  if (! this.isFolder(aFolderURI)) {
    throw Components.Exception("aeClippingsService.detachFromFolder(): URI argument is not a folder resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv;
  var parentFolderURI = this.getParent(aFolderURI);
  var parentCtr = this._getSeqContainerFromFolder(parentFolderURI);
  var node = this._rdfSvc.GetResource(aFolderURI);
  node = node.QueryInterface(Components.interfaces.nsIRDFResource);

  rv = parentCtr.IndexOf(node);
  parentCtr.RemoveElement(node, true);

  this._detachedItems.push(aFolderURI);

  if (this.getCountSubfolders(parentFolderURI) == 0) {
    this._setHasSubfoldersTriple(parentFolderURI, false);
  }

  var numItemsInFolder = this.getCount(parentFolderURI);
  if (numItemsInFolder == 0) {
    this._appendDummyNode(parentFolderURI);
  }

  this._count = this._countRec(this._rdfContainer);

  return rv;
};


aeClippingsServiceImpl.prototype.reattachToFolder = function (aParentFolderURI, aURI, aPos)
{
  // NOTE: aPos is a 1-based (not zero-based) index.
  var prevSubfCount = this.getCountSubfolders(aParentFolderURI);
  var parentCtr = this._getSeqContainerFromFolder(aParentFolderURI);
  var node = this._rdfSvc.GetResource(aURI);
  node = node.QueryInterface(Components.interfaces.nsIRDFResource);

  if (aPos) {
    try {
      parentCtr.InsertElementAt(node, aPos, true);
    }
    catch (e) {
      throw Components.Exception("**ERROR: aNode=" + node + "; aPos=" + aPos + "\n" + e);
    }
  }
  else {
    parentCtr.AppendElement(node);
  }

  this._removeDummyNode(aParentFolderURI);
  
  if (this.isFolder(aURI) && prevSubfCount == 0) {
    this._setHasSubfoldersTriple(aParentFolderURI, true);
  }

  // Remove the detached clipping or folder from the detached item list
  var currDetachedItems = this._detachedItems;

  this._detachedItems = currDetachedItems.filter(function (aDetachedItemURI) {
    return (aDetachedItemURI != aURI);
  });

  this._count = this._countRec(this._rdfContainer);
};


aeClippingsServiceImpl.prototype.purgeDetachedItems = function ()
{
  var node, uri;
  var len = this._detachedItems.length;
  var cnt = len;

  this._log("About to purge detached items; total " + this._detachedItems.length + " detached item(s)");

  for (let i = 0; i < len; i++) {
    uri = this._detachedItems[i];
    if (! uri) {
      continue;
    }

    node = this._rdfSvc.GetResource(uri);
    node = node.QueryInterface(Components.interfaces.nsIRDFResource);

    // Add the detached node to the root RDF container, and then delete the
    // node. This is the only known way to permanently remove the detached node
    // from the data source.
    this._rdfContainer.AppendElement(node);
    this.remove(uri, true, true);
    cnt--;
  }

  this._log("Purge completed; there are now " + cnt + " detached item(s) (count should be zero)");

  this._detachedItems = [];
};


aeClippingsServiceImpl.prototype.isDetached = function (aURI)
{
  var rv = false;
  var i = 0;

  while (!rv && i < this._detachedItems.length) {
    if (this._detachedItems[i] && this._detachedItems[i] == aURI) {
      rv = true;
      break;
    }
    i++;
  }

  return rv;
};


aeClippingsServiceImpl.prototype.exists = function (aURI)
{
  if (aURI == this.kRootFolderURI) {
    return true;
  }

  var rv = false;
  var node;

  try {
    node = this._rdfSvc.GetResource(aURI);
  }
  catch (e) {}

  if (! node) {
    return rv;
  }

  var parentFolderURI, parentCtr;

  try {
    parentFolderURI = this.getParent(aURI);
  }
  catch (e) {}

  if (! parentFolderURI) {
    return rv;
  }

  parentCtr = this._getSeqContainerFromFolder(parentFolderURI);

  if (parentCtr.IndexOf(node) != -1) {
    rv = true;
  }
  
  return rv;
};


aeClippingsServiceImpl.prototype.indexOf = function (aURI)
{
  if (! this.exists(aURI)) {
    return -1;
  }

  var rv;
  var node = this._rdfSvc.GetResource(aURI);
  var parentFolderURI = this.getParent(aURI);
  var parentCtr = this._getSeqContainerFromFolder(parentFolderURI);
  var childrenEnum = parentCtr.GetElements();
  var i = 1;

  while (childrenEnum.hasMoreElements()) {
    if (childrenEnum.getNext().Value == aURI) {
      rv = i;
      break;
    }
    i++;
  }

  return rv;
};


aeClippingsServiceImpl.prototype.ctrIndexOf = function (aURI)
{
  var rv;
  var node = this._rdfSvc.GetResource(aURI);
  var parentFolderURI = this.getParent(aURI);
  var parentCtr = this._getSeqContainerFromFolder(parentFolderURI);

  rv = parentCtr.IndexOf(node);  // Will return -1 if node doesn't exist.
  return rv;
};


aeClippingsServiceImpl.prototype.getName = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.getName(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv;

  // Root folder
  if (aURI == this.kRootFolderURI) {
    rv = "[clippings-root]";
  }
  else {
    var subjName = this._rdfSvc.GetResource(aURI);
    var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
    var targName = ds.GetTarget(subjName, predName, true);
    if (targName instanceof Components.interfaces.nsIRDFLiteral) {
      rv = targName.Value;
    }
  }
  return rv;
};


aeClippingsServiceImpl.prototype.getText = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.getText(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.getText(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv;
  var subjText = this._rdfSvc.GetResource(aURI);
  var predText = this._rdfSvc.GetResource(this._PREDTEXT_RESOURCE_URI);
  var targText = ds.GetTarget(subjText, predText, true);
  if (targText instanceof Components.interfaces.nsIRDFLiteral) {
    rv = targText.Value;
  }
  return rv;
};


aeClippingsServiceImpl.prototype.getSourceURL = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.getSourceURL(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.getSourceURL(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv = "";

  // If the clipping -> srcurl triple doesn't exist, simply treat it as if the
  // source URL did exist, and its value is an empty string.
  if (this.hasSourceURL(aURI, ds)) {
    var subjSrcURL = this._rdfSvc.GetResource(aURI);
    var predSrcURL = this._rdfSvc.GetResource(this._PREDSRCURL_RESOURCE_URI);
    var targSrcURL = ds.GetTarget(subjSrcURL, predSrcURL, true);
    if (targSrcURL instanceof Components.interfaces.nsIRDFLiteral) {
      rv = targSrcURL.Value;
    }
  }

  return rv;
};


aeClippingsServiceImpl.prototype.getLabel = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.getLabel(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.Label(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var rv;

  if (this.hasLabel(aURI, ds)) {
    var subjLabel = this._rdfSvc.GetResource(aURI);
    var predLabel = this._rdfSvc.GetResource(this._PREDLABEL_RESOURCE_URI);
    var targLabel = ds.GetTarget(subjLabel, predLabel, true);
    if (targLabel instanceof Components.interfaces.nsIRDFLiteral) {
      rv = targLabel.Value;
    }
  }
  else {
    rv = this.LABEL_NONE;
  }

  return rv;
};


aeClippingsServiceImpl.prototype.setName = function (aURI, aName)
{
  if (! this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.setName(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  var name = this._sanitize(aName);
  var subjName = this._rdfSvc.GetResource(aURI);
  var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
  var targOldName = this._dataSrc.GetTarget(subjName, predName, true);
  var targNewName = this._rdfSvc.GetLiteral(name);
  this._dataSrc.Change(subjName, predName, targOldName, targNewName);
};


aeClippingsServiceImpl.prototype.setText = function (aURI, aText)
{
  if (! this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.setText(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI)) {
    throw Components.Exception("aeClippingsService.setText(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var text = this._sanitize(aText || "");
  var subjText = this._rdfSvc.GetResource(aURI);
  var predText = this._rdfSvc.GetResource(this._PREDTEXT_RESOURCE_URI);
  var targOldText;
  targOldText = this._dataSrc.GetTarget(subjText, predText, true);
  var targNewText = this._rdfSvc.GetLiteral(text);

  if (targOldText) {
    this._dataSrc.Change(subjText, predText, targOldText, targNewText);
  }
  else {
    // Clipping RDF node was missing the "text" predicate; reason unknown
    // (see issue #189)
    this._dataSrc.Assert(subjText, predText, targNewText, true);
  }
};


aeClippingsServiceImpl.prototype.setSourceURL = function (aURI, aSourceURL)
{
  if (! this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.setSourceURL(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI)) {
    throw Components.Exception("aeClippingsService.setSourceURL(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var srcURL = this._sanitize(aSourceURL);
  var subjSrcURL = this._rdfSvc.GetResource(aURI);
  var predSrcURL = this._rdfSvc.GetResource(this._PREDSRCURL_RESOURCE_URI);

  if (this.hasSourceURL(aURI)) {
    var targOldSrcURL = this._dataSrc.GetTarget(subjSrcURL, predSrcURL, true);
    var targNewSrcURL = this._rdfSvc.GetLiteral(srcURL);
    this._dataSrc.Change(subjSrcURL, predSrcURL, targOldSrcURL, targNewSrcURL);
  }
  else {
    // The clipping -> srcurl triple doesn't exist; this would occur with older
    // datasources created prior to version 5.0.  If that is the case, then
    // automatically add the triple.
    var targSrcURL = this._rdfSvc.GetLiteral(srcURL);
    this._dataSrc.Assert(subjSrcURL, predSrcURL, targSrcURL, true);
  }
};


aeClippingsServiceImpl.prototype.setLabel = function (aURI, aLabel)
{
  if (! this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.setSourceURL(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI)) {
    throw Components.Exception("aeClippingsService.setSourceURL(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var subjLabel = this._rdfSvc.GetResource(aURI);
  var predLabel = this._rdfSvc.GetResource(this._PREDLABEL_RESOURCE_URI);

  if (this.hasLabel(aURI)) {
    var targOldLabel = this._dataSrc.GetTarget(subjLabel, predLabel, true);
    var targNewLabel = this._rdfSvc.GetLiteral(aLabel);
    this._dataSrc.Change(subjLabel, predLabel, targOldLabel, targNewLabel);
  }
  else {
    var targLabel = this._rdfSvc.GetLiteral(aLabel);
    this._dataSrc.Assert(subjLabel, predLabel, targLabel, true);
  }
};


aeClippingsServiceImpl.prototype.hasSourceURL = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.hasSourceURL(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.getText(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var subjSrcURL = this._rdfSvc.GetResource(aURI);
  var predSrcURL = this._rdfSvc.GetResource(this._PREDSRCURL_RESOURCE_URI);
  var rv = ds.hasArcOut(subjSrcURL, predSrcURL);

  return rv;
};


aeClippingsServiceImpl.prototype.hasLabel = function (aURI, aDataSrc)
  // aDataSrc param for internal use only.  Not exposed in interface.
{
  var ds = aDataSrc || this._dataSrc;
  if (! ds) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  if (!aDataSrc && !this.exists(aURI)) {
    throw Components.Exception("aeClippingsService.hasLabel(): URI argument doesn't exist", Components.results.NS_ERROR_INVALID_ARG);
  }

  if (! this.isClipping(aURI, ds)) {
    throw Components.Exception("aeClippingsService.hasLabel(): URI argument is not a clipping resource", Components.results.NS_ERROR_INVALID_ARG);
  }

  var subjLabel = this._rdfSvc.GetResource(aURI);
  var predLabel = this._rdfSvc.GetResource(this._PREDLABEL_RESOURCE_URI);
  var rv = ds.hasArcOut(subjLabel, predLabel);

  return rv;
};


aeClippingsServiceImpl.prototype.changePosition = function (aParentFolderURI, aOldPos, aNewPos)
{
  var parentCtr;
  if (aParentFolderURI == this.kRootFolderURI) {
    parentCtr = this._rdfContainer;
  }
  else {
    parentCtr = this._getSeqContainerFromFolder(aParentFolderURI);
  }

  var node = parentCtr.RemoveElementAt(aOldPos, true);
  this._log("aeClippingsService.changePosition(): node=" + node + "; aOldPos=" + aOldPos + "; aNewPos=" + aNewPos);
  parentCtr.InsertElementAt(node, aNewPos, true);
};


aeClippingsServiceImpl.prototype.flushDataSrc = function (aDoBackup, aUpdateSyncFile)
{
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  try {
    this._dataSrc.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource).Flush();
  }
  catch (e) {
    this._log("aeClippingsService.flushDataSrc(): Data source flush failed!" + e);
    throw e;
  }
  this._log("*** Clippings datasource saved to disk ***");

  if (aDoBackup && this._maxBackupFiles > 0) {
    try {
      this._doBackup();
    }
    catch (e) {
      this._log("aeClippingsService.flushDataSrc(): WARNING: Backup failed:" + e);
    }
  }
   
  try {
    this._deleteOldBackupFiles();
  }
  catch (e) {
    this._log("aeClippingsService.flushDataSrc(): WARNING: Cannot delete old backup file(s): " + e);
  }

  // Save copy of datasource to Clippings 6 JSON file.
  let dsURLPrefix = this._dsFileURL.substring(0, this._dsFileURL.lastIndexOf("/") + 1);
  let jsonCpyFileURL = dsURLPrefix + this._WX_COPY_FILENAME;
  
  this._log("aeClippingsService.flushDataSrc(): Saving a copy of the datasource to a Clippings 6 file.");
  this.exportToFile(jsonCpyFileURL, this.FILETYPE_WX_JSON, false);

  if (aUpdateSyncFile) {
    let syncFileURL = this._syncDirURL + this._WX_SYNC_FILENAME;
    this._log("aeClippingsService.flushDataSrc(): Saving all items in the \"Sync Clippings\" folder to sync file: " + syncFileURL);
    
    this.exportSubfolderToFile(syncFileURL, this.FILETYPE_WX_JSON, false, this._SYNCED_CLIPPINGS_FOLDER_URI);
  }
};


aeClippingsServiceImpl.prototype.refreshDataSrc = function ()
{
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }
  
  try {
    this._dataSrc.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource).Refresh(true);
  }
  catch (e) {
    this._log("aeClippingsService.refreshDataSrc(): Data source refresh failed!\n" + e);
    throw e;
  }

  var newCount = this.recountAll();
  this._log("Data source refreshed!  There are now " + newCount + " items.");
};


aeClippingsServiceImpl.prototype.refreshSyncedClippings = function (aNotify)
{
  let that = this;
  
  function removeSyncFolder()
  {
    let syncFldrCtr = that._getSeqContainerFromFolder(that._SYNCED_CLIPPINGS_FOLDER_URI);
    let childrenEnum = syncFldrCtr.GetElements();
    while (childrenEnum.hasMoreElements()) {
      let child = childrenEnum.getNext();
      child = child.QueryInterface(Components.interfaces.nsIRDFResource);
      let childURI = child.Value;
      that.remove(childURI, true, true);
    }

    that.remove(that._SYNCED_CLIPPINGS_FOLDER_URI);
  }
  
  function getSyncedClippingsData()
  {
    let rv = "";

    let syncFileURL = that._syncDirURL + that._WX_SYNC_FILENAME;

    that._log("aeClippingsService.refreshSyncedClippings():getSyncedClippingsData(): Sync file URL: " + syncFileURL);

    let syncFile = that._getFileFromURL(syncFileURL);

    return new Promise(function (aFnResolve, aFnReject) {
      if (!syncFile.exists() || !syncFile.isFile()) {
        that._log("aeClippingsService.refreshSyncedClippings():getSyncedClippingsData(): Sync file does not exist. Generating blank synced clippings data.");
        let jsonData = that._getWxJSONTemplate();
        rv = JSON.stringify(jsonData);
        aFnResolve(rv);
        return;
      }

      // Get the synced clippings data from the sync file.
      let syncFilePath = syncFile.path;
      let readFile = OS.File.read(syncFilePath, { encoding: "utf-8" });

      readFile.then(aFileData => {
        rv = aFileData;
        aFnResolve(rv);
      }).catch(aFileErr => {
        aFnReject(Components.Exception("Error reading " + that._WX_SYNC_FILENAME));  
      });
    });
  }
  // END nested functions
  
  if (! this._dataSrc) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  this._log("aeClippingsService.refreshSyncedClippings(): Reading sync file...");
  
  getSyncedClippingsData().then(function (aJSONSyncRawData) {
    that._log("aeClippingsService.refreshSyncedClippings(): Parsing JSON data from sync file...");
      
    let jsonSyncData = [];
    try {
      jsonSyncData = JSON.parse(aJSONSyncRawData);
    }
    catch (e) {
      throw Components.Exception("Failed to import JSON data: " + e);
    }

    if (jsonSyncData.userClippingsRoot === undefined) {
      throw Components.Exception("Malformed JSON data");
    }

    // Create or recreate the Synced Clippings folder only after successfully
    // reading and parsing the data from the sync file.
    if (that.exists(that._SYNCED_CLIPPINGS_FOLDER_URI)) {
      that._log("aeClippingsService.refreshSyncedClippings(): The Synced Clippings folder exists. Now removing and recreating it...");
      removeSyncFolder();
    }

    that._log("aeClippingsService.refreshSyncedClippings(): Creating the 'Synced Clippings' folder...");
    try {
      that.createNewFolderEx(that.kRootFolderURI, that._SYNCED_CLIPPINGS_FOLDER_URI, that._syncedClippingsFldrName, 1, false, that.ORIGIN_HOSTAPP);
    }
    catch (e) {
      that._log("aeClippingsService.refreshSyncedClippings(): Exception thrown while creating 'Synced Clippings' folder: " + e);
    }

    that._log("aeClippingsService.refreshSyncedClippings(): Importing clippings data from sync file...");

    let keyMap = that.getShortcutKeyMap();
    let syncCount = that._importFromJSONHelper(that.kSyncFolderURI, jsonSyncData.userClippingsRoot, false, keyMap);

    that._log("aeClippingsService.refreshSyncedClippings(): Refresh of Sync Clippings data completed: " + syncCount + " items synchronized.");

    if (aNotify) {
      that.notifySyncLocationChanged();
    }
  });
};


aeClippingsServiceImpl.prototype._doBackup = function ()
{
  var dir = this._getFileFromURL(this._backupDirURL);
  try {
    dir = dir.QueryInterface(Components.interfaces.nsIFile);
  }
  catch (e) {
    throw Components.Exception("aeClippingsService._doBackup(): Failed to get nsIFile object for backup dir:\n" + e);
  }

  if (!dir.exists() || !dir.isDirectory()) {
    this._log("aeClippingsService._doBackup(): Creating backup directory\n'" 
	      + this._backupDirURL + "'");
    dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 
               parseInt("0755", 8));
  }

  var dateTime = this._getDateTimeString();
  var fileURL = this._backupDirURL + "/" + this._BACKUP_FILE_PREFIX + dateTime 
                                   + this._BACKUP_FILE_EXTENSION;
  this._log("Writing backup file:\n'" + fileURL + "'");
  var rds = this._dataSrc.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
  try {
    rds.FlushTo(fileURL);
  }
  catch (e) {
    throw e;
  }
};


aeClippingsServiceImpl.prototype._deleteOldBackupFiles = function ()
{
  try {
    var backupFiles = this._getBackupFiles();
  }
  catch (e) {
    this._log(e);
    throw e;
  }

  this._log("aeClippingsService._deleteOldBackupFiles(): Number of backup files: " + backupFiles.length);

  while (backupFiles.length > this._maxBackupFiles) {
    var file = backupFiles.shift();  // backupFiles[] ordered oldest -> newest
    try {
      file = file.QueryInterface(Components.interfaces.nsIFile);
    }
    catch (e) {
      throw Components.Exception("aeClippingsService._deleteOldBackupFiles(): Failed to get nsIFile object for backup file to remove:\n" + e);
    }

    this._log("aeClippingsService._deleteOldBackupFiles(): Deleting old backup file: " + file.leafName);
    try {
      file.remove(false);
    }
    catch (e) { 
      throw e;
    }
  }
};


aeClippingsServiceImpl.prototype._getBackupFiles = function ()
{
  var dir = this._getFileFromURL(this._backupDirURL);
  try {
    dir = dir.QueryInterface(Components.interfaces.nsIFile);
  }
  catch (e) {
    throw Components.Exception("aeClippingsService._getBackupFiles(): Failed to get nsIFile object for backup dir:\n" + e);
  }

  var files = [];

  // The situation where the backup directory doesn't exist should be treated
  // the same as if no backup files were found, since this situation would
  // only occur if backups haven't been created yet.
  if (!dir.exists() || !dir.isDirectory()) {
    return files;
  }

  let dirEntriesEnum = dir.directoryEntries;
  while (dirEntriesEnum.hasMoreElements()) {
    let file = dirEntriesEnum.getNext();
    try {
      file = file.QueryInterface(Components.interfaces.nsIFile);
    }
    catch (e) {
      throw Components.Exception("aeClippingsService._getBackupFiles(): Failed to get nsIFile object for backup file being enumerated:\n" + e, Components.results.NS_ERROR_UNEXPECTED);
    }
    files.push(file);
  }

  // Sort files[] array, ordered by file names.
  files.sort(function (file1, file2) {
               if (file1.leafName < file2.leafName) return -1;
               if (file1.leafName > file2.leafName) return 1;
               return 0;
             });
  return files;
};  


aeClippingsServiceImpl.prototype.getBackupFileNamesMap = function ()
{
  let rv, backupFiles;
  
  try {
    backupFiles = this._getBackupFiles();
  }
  catch (e) {
    this._log(e);
    throw e;
  }

  rv = new Map();
  let fileNames = [];
  
  for (let i = 0; i < backupFiles.length; i++) {
    let filename = backupFiles[i].leafName;
    fileNames.push(filename);
  }
  fileNames = fileNames.sort();

  for (let i = 0; i < fileNames.length; i++) {
    let filename = fileNames[i];
    let friendlyDateTime = this._parseBackupFilename(filename);
    rv.set(filename, friendlyDateTime);
  }

  return rv;
};


aeClippingsServiceImpl.prototype._parseBackupFilename = function (aFilename)
{
  var rv;
  var processedFilename = aFilename.replace(/\.rdf$/, "");
  processedFilename = processedFilename.replace(/^clippings_/, "");
  
  var dateTimeSrch = processedFilename.match(/(\d{4}\-\d{2}\-\d{2})_(\d{6})/);
  var date = dateTimeSrch[1];
  var time = dateTimeSrch[2];

  // Note that numeric months are zero-based (0=Jan, 1=Feb, 2=Mar, ...)
  var dateTime = new Date(date.substr(0,4), (date.substr(5,2)-1), date.substr(8,2), time.substr(0,2), time.substr(2,2), time.substr(4,2));
  rv = dateTime.toLocaleString();

  return rv;
};


aeClippingsServiceImpl.prototype.recoverFromBackup = function ()
{
  try {
    var backupFiles = this._getBackupFiles();
  }
  catch (e) {
    this._log(e);
    throw Components.Exception("aeClippingsService.recoverFromBackup(): Failed to enumerate backup files:\n" + e, Components.results.NS_ERROR_UNEXPECTED);
  }

  if (!backupFiles || backupFiles.length == 0) {
    throw Components.Exception("aeClippingsService.recoverFromBackup(): No backup files found!", Components.results.NS_ERROR_FILE_NOT_FOUND);
  }

  var extSeqNode = this._rdfSvc.GetResource(this._SEQNODE_RESOURCE_URI);
  var found = false;
  var url;

  while (!found && backupFiles.length > 0) {
    let file = backupFiles.pop();
    try {
      file = file.QueryInterface(Components.interfaces.nsIFile);
    }
    catch (e) {
      throw Components.Exception("aeClippingsService.recoverFromBackup(): Failed to retrieve nsIFile object", Components.results.NS_ERROR_UNEXPECTED);
    }

    try {
      url = this._getURLFromFile(file);
    }
    catch (e) {
      throw Components.Exception("aeClippingsService.recoverFromBackup(): Failed to retrieve URL of nsIFile object", Components.results.NS_ERROR_UNEXPECTED);
    }

    this._log("aeClippingsService.recoverFromBackup(): Trying backup file whose file name is '" + file.leafName + "' and whose URL is: '" + url + "'");

    var extRDFContainer = Components.classes["@mozilla.org/rdf/container;1"].createInstance(Components.interfaces.nsIRDFContainer);

    try {
      var extDataSrc = this._rdfSvc.GetDataSourceBlocking(url);
      extRDFContainer.Init(extDataSrc, extSeqNode);
    }
    catch (e) {
      // File not readable - either it is corrupted, or it isn't a valid
      // Clippings backup file.
      this._log(e);
      continue;
    }

    if (this._rdfContainerUtils.IsSeq(extDataSrc, extSeqNode)) {
      found = true;
    }
  }

  if (! found) {
    throw Components.Exception("aeClippingsService.recoverFromBackup(): Cannot find any valid backup files!", Components.results.NS_ERROR_FILE_NOT_FOUND);
  }
  
  this._log("aeClippingsService.recoverFromBackup(): Found a candidate backup file whose URL is: '" + url + "' - contains " + extRDFContainer.GetCount() + " entries");

  // Delete corrupted data source file
  this._log("aeClippingsService.recoverFromBackup(): Deleting corrupted datasource file");

  try {
    this.killDataSrc();
  }
  catch (e) {
    throw Components.Exception("aeClippingsService.recoverFromBackup(): Cannot delete damaged data source file", Components.results.NS_ERROR_UNEXPECTED);
  }

  this._log("aeClippingsService.recoverFromBackup(): Invoking aeClippingsService.getDataSource() to generate a new, empty RDF datasource file");

  this._count = -1;  // Reset internal counter.
  var newDataSrc = this.getDataSource(this._dsFileURL, true);

  try {
    newDataSrc = newDataSrc.QueryInterface(Components.interfaces.nsIRDFDataSource);
  }
  catch (e) {
    throw Components.Exception("aeClippingsService.recoverFromBackup(): Failed to regenerate RDF datasource!\n" + e, Components.results.NS_ERROR_UNEXPECTED);
  }

  this._log("aeClippingsService.recoverFromBackup(): Invoking aeClippingsService.importFromFile()");

  var count = this.importFromFile(url, false, true, {});

  this._log("aeClippingsService.recoverFromBackup(): " + count + " entries imported - newDataSrc: " + newDataSrc);

  return newDataSrc;
};


aeClippingsServiceImpl.prototype.notifyDataSrcLocationChanged = function ()
{
  if (!this._dataSrc || !this._dsFileURL) {
    throw Components.Exception("Datasource not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  for (let i = 0; i < this._listeners.length; i++) {
    if (this._listeners[i]) {
      this._log("aeClippingsService.notifyDataSrcLocationChanged(): Notifying observer " + i + "; origin: " + this._listeners[i].origin + " (1 = Clippings Manager; 2 = host app window; 3 = New Clipping dialog)");
      this._listeners[i].dataSrcLocationChanged(this._dsFileURL);
    }
  }
};


aeClippingsServiceImpl.prototype.notifySyncLocationChanged = function ()
{
  if (!this._dataSrc || !this._dsFileURL) {
    throw Components.Exception("Datasource not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  for (let i = 0; i < this._listeners.length; i++) {
    if (this._listeners[i]) {
      this._log("aeClippingsService.notifySyncLocationChanged(): Notifying observer " + i + "; origin: " + this._listeners[i].origin + " (1 = Clippings Manager; 2 = host app window; 3 = New Clipping dialog)");
      this._listeners[i].syncLocationChanged(this._syncDirURL);
    }
  }
};


aeClippingsServiceImpl.prototype.killDataSrc = function ()
{
  this._log("aeClippingsService.killDataSrc(): URL of data source:\n"
	    + "'" + this._dsFileURL + "'");
  if (! this._dsFileURL) {
    throw Components.Exception("dsFileURL not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  var oldDSFile = this._getFileFromURL(this._dsFileURL);
  try {
    oldDSFile = oldDSFile.QueryInterface(Components.interfaces.nsIFile);
  }
  catch (e) {
    throw Components.Exception("aeClippingsService.killDataSrc(): Failed to get nsIFile object for datasource file!\n" + e, NS_ERROR_UNEXPECTED);
  }

  if (!oldDSFile.exists() || !oldDSFile.isFile()) {
    throw Components.Exception("aeClippingsService.killDataSrc(): File doesn't exist!", Components.results.NS_ERROR_FILE_NOT_FOUND);
  }

  this._log("aeClippingsService.killDataSrc(): removing file:\n"
	    + "'" + this._dsFileURL + "'");

  try {
    oldDSFile.remove(false);
  }
  catch (e) {
    var msg = "aeClippingsService.killDataSrc(): Failed to delete corrupted datasource file!\n" + e;
    this._log(msg);
    throw Components.Exception(msg);
  }
};


aeClippingsServiceImpl.prototype.exportToJSONString = function ()
{
  let rv = "";
  let jsonData = [];

  this._exportAsClippingsWxJSON(this._rdfContainer, jsonData, true, true, true);
  rv = JSON.stringify(jsonData);

  return rv;
};


aeClippingsServiceImpl.prototype.getSubfolderItemsAsJSONString = function (aFolderURI)
{
  let rv = "";
  let jsonData = [];
  let rootFldrCtr;

  if (aFolderURI == this.kRootFolderURI) {
    rootFldrCtr = this._rdfContainer;
  }
  else {
    rootFldrCtr = this._getSeqContainerFromFolder(aFolderURI);
  }

  let childrenEnum = rootFldrCtr.GetElements();
  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;

    let folderItem = {
      uri: childURI,
      name: this.getName(childURI),
      isFolder: this.isFolder(childURI)
    };
    jsonData.push(folderItem);
  }

  rv = JSON.stringify(jsonData);
  return rv;
};


aeClippingsServiceImpl.prototype.enableSyncClippings = function (aIsEnabled)
{
  this._syncedClippings = aIsEnabled;

  if (aIsEnabled) {
    if (this.exists(this._SYNCED_CLIPPINGS_FOLDER_URI)) {
      return;
    }

    this.createNewFolderEx(this.kRootFolderURI, this._SYNCED_CLIPPINGS_FOLDER_URI, this._syncedClippingsFldrName, 1, true, null);
  }
  else {
    // Delete the "Synced Clippings" folder only if it is empty.
    if (this.exists(this._SYNCED_CLIPPINGS_FOLDER_URI) && this.getCount(this._SYNCED_CLIPPINGS_FOLDER_URI) == 0) {
      this.remove(this._SYNCED_CLIPPINGS_FOLDER_URI);
    }
  }
};


aeClippingsServiceImpl.prototype.setSyncDir = function (aSyncDirURL)
{
  this._syncDirURL = aSyncDirURL;
};


aeClippingsServiceImpl.prototype.setSyncedClippingsFolderName = function (aFolderName) {
  this._syncedClippingsFldrName = aFolderName;
};


aeClippingsServiceImpl.prototype.exportToFile = function (aFileURL, aFileType, aIncludeSrcURLs)
{
  this.exportSubfolderToFile(aFileURL, aFileType, aIncludeSrcURLs, this.kRootFolderURI);
};


aeClippingsServiceImpl.prototype.exportSubfolderToFile = function (aFileURL, aFileType, aIncludeSrcURLs, aFolderURI)
{
  // We have to do it this way because we don't want to include unpurged
  // detached folders with the exported file.
  var extSeqNode;
  var extDS;

  if (aFileType == this.FILETYPE_RDF_XML || aFileType == this.FILETYPE_CSV
      || aFileType == this.FILETYPE_WX_JSON) {
    extSeqNode = this._rdfSvc.GetResource(this._SEQNODE_RESOURCE_URI);
  }
  else if (aFileType == this.FILETYPE_CLIPPINGS_1X) {
    extSeqNode = this._rdfSvc.GetResource(this._OLD_SEQNODE_RESOURCE_URI);
  }
  else {
    throw Components.Exception("File type not supported",
			       Components.result.NS_ERROR_INVALID_ARG);
  }

  // Must delete existing file with the same name; otherwise, the `FlushTo'
  // call below will append instead of overwrite the RDF/XML file.
  var file = this._getFileFromURL(aFileURL);
  if (file.exists()) {
    this._log("NOTE: An export file with the same URL already exists; removing it.");
    file.remove(false);
  }

  let count, format, extRootCtr, jsonData, csvData;

  if (aFileType == this.FILETYPE_RDF_XML || aFileType == this.FILETYPE_CLIPPINGS_1X) {
    try {
      // Exported data source file will be created automatically.
      extDS = this._rdfSvc.GetDataSourceBlocking(aFileURL);
    }
    catch (e) {
      throw e;
    }

    extRootCtr = this._rdfContainerUtils.MakeSeq(extDS, extSeqNode);
    extRootCtr = extRootCtr.QueryInterface(Components.interfaces.nsIRDFContainer);
  }
  else {
    csvData = [];
    jsonData = this._getWxJSONTemplate();
  }

  this._log("Initialized export file - URL: '" + aFileURL + "'");

  if (aFileType == this.FILETYPE_CLIPPINGS_1X) {
    count = this._exportLegacyRDFXML(this._rdfContainer, extDS, extRootCtr);
    format = "Clippings 1.x RDF/XML";
  }
  else if (aFileType == this.FILETYPE_CSV) {
    count = this._exportAsCSV(this._rdfContainer, csvData);
    format = "CSV";
  }
  else if (aFileType == this.FILETYPE_WX_JSON) {
    let rootFldrCtr;
    if (aFolderURI == this.kRootFolderURI) {
      rootFldrCtr = this._rdfContainer;
    }
    else {
      rootFldrCtr = this._getSeqContainerFromFolder(aFolderURI);
    }

    let inclSyncFldr = aFolderURI == this._SYNCED_CLIPPINGS_FOLDER_URI;
    
    count = this._exportAsClippingsWxJSON(rootFldrCtr, jsonData.userClippingsRoot, aIncludeSrcURLs, false, inclSyncFldr);
    format = "Clippings/wx JSON";
  }
  else {
    // A prime example of software reuse.
    count = this._importFromFileEx(this._rdfContainer, this._dataSrc, extRootCtr, extDS, true, aIncludeSrcURLs);
    format = "Clippings RDF/XML";
  }

  this._log("Exported " + count + " item(s); format: " + format);

  if (aFileType == this.FILETYPE_RDF_XML || aFileType == this.FILETYPE_CLIPPINGS_1X) {
    var rds = extDS.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
    try {
      rds.FlushTo(aFileURL);
    }
    catch (e) {
      this._log(e);
      throw e;
    }
    return;
  }

  let fileData = "";
  
  if (aFileType == this.FILETYPE_CSV) {
    fileData = csvData.join("\r\n");
  }
  else if (aFileType == this.FILETYPE_WX_JSON) {
    fileData = JSON.stringify(jsonData);
  }

  this.writeFile(aFileURL, fileData);
};


aeClippingsServiceImpl.prototype._exportAsCSV = function (aFolderCtr, aCSVData)
{
  let rv = 0;
  let count = 0;
  let childrenEnum = aFolderCtr.GetElements();
  
  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;

    if (this.isFolder(childURI) && childURI != this._SYNCED_CLIPPINGS_FOLDER_URI) {
      let subfolderCtr = this._getSeqContainerFromFolder(childURI);
      count += this._exportAsCSV(subfolderCtr, aCSVData);
    }
    else if (this.isClipping(childURI)) {
      let name = this.getName(childURI);
      let content = this.getText(childURI);
      content = content.replace(/\"/g, '""');
      aCSVData.push(`"${name}","${content}"`);
      count++;
    }
  }
  rv = count;
  
  return rv;
};


aeClippingsServiceImpl.prototype._exportAsClippingsWxJSON = function (aFolderCtr, aJSONFolderData, aIncludeSrcURLs, aIncludeIDs, aIncludeSyncFldr)
{
  let rv;
  let count = 0;
  let childrenEnum = aFolderCtr.GetElements();
  
  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;
    if (this.isFolder(childURI)) {
      // Exclude the Synced Clippings folder unless synchronizing.
      if (childURI == this._SYNCED_CLIPPINGS_FOLDER_URI && !aIncludeSyncFldr) {
        continue;
      }
      
      let subfolderCtr = this._getSeqContainerFromFolder(childURI);
      let fldrItems = [];
      count += this._exportAsClippingsWxJSON(subfolderCtr, fldrItems, aIncludeSrcURLs, aIncludeIDs);

      let fldr = {
        name: this.getName(childURI),
        children: fldrItems,
      };

      if (aIncludeIDs) {
	fldr.uri = childURI;
      }
      aJSONFolderData.push(fldr);

      count++;
    }
    else if (this.isClipping(childURI)) {
      let srcURL = (aIncludeSrcURLs ? this.getSourceURL(childURI) : "");
      let clipping = {
        name:        this.getName(childURI),
        content:     this.getText(childURI),
        shortcutKey: this.getShortcutKey(childURI),
        sourceURL:   srcURL,
        label:       this.getLabel(childURI)
      };

      if (aIncludeIDs) {
	clipping.uri = childURI;
      }
      aJSONFolderData.push(clipping);

      count++;
    }
  }
  rv = count;
  
  return rv;
};


aeClippingsServiceImpl.prototype._getWxJSONTemplate = function ()
{
  let rv = {
    version: this._JSON_EXPORT_VER,
    createdBy: this._JSON_EXPORT_CREATED_BY,
    userClippingsRoot: []
  };

  return rv;
};


aeClippingsServiceImpl.prototype.getClippingsAsHTML = function ()
{
  let rv = "";

  // Put the Clippings HTML heading in a pref to permit localization.
  let prefSvc = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  let htmlTitle = prefSvc.getCharPref("extensions.aecreations.clippings.export.html.title");

  rv = this._exportHTMLHelper(this._rdfContainer, htmlTitle);
  
  return rv;
};


aeClippingsServiceImpl.prototype.writeFile = function (aFileURL, aData)
{
  var file = this._getFileFromURL(aFileURL);
  var charset = "UTF-8";
  var fos = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
  // Write, create, truncate.
  fos.init(file, 0x02 | 0x08 | 0x20, parseInt("0755", 8), 0);

  // Mozilla 1.8 (Firefox 1.5) or greater
  if ("nsIConverterOutputStream" in Components.interfaces) {
    var cos = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
                        .createInstance(Components.interfaces
		 	 	                  .nsIConverterOutputStream);
    cos.init(fos, charset, 0, "?".charCodeAt(0));
    cos.writeString(aData);
    cos.close();
  }
  // Firefox 1.0.x
  else {
    var conv = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
    conv.charset = charset;
    
    try {
      var data = conv.ConvertToUnicode(aData);
      var fin = conv.Finish();
      fos.write(data, data.length);
      if (fin.length > 0) {
	fos.write(fin, fin.length);
      }
      
      this._log("aeClippingsService.writeFile(): Successfully wrote data to file");
    }
    catch (e) {
      this._log("aeClippingsService.writeFile(): Failed to convert data to Unicode; writing data as is");
      fos.write(aData, aData.length);
    }
    
    fos.close();
  }
};


aeClippingsServiceImpl.prototype._exportHTMLHelper = function (aLocalFolderCtr, aDocTitleText)
{
  let that = this;
  
  function exportToHTMLHelper(aFldrItems)
  {
    let rv = "<dl>";
    
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

  let expData = [];
  try {
    this._exportAsClippingsWxJSON(aLocalFolderCtr, expData, false, false, true);
  }
  catch (e) {
    this._log("aeClippingsService._exportHTMLHelper(): " + e);
    throw e;
  }

  let htmlSrc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${aDocTitleText}</title></head><body><h1>${aDocTitleText}</h1>`;

  htmlSrc += exportToHTMLHelper(expData);

  rv = htmlSrc + "</body></html>";

  return rv;
};


aeClippingsServiceImpl.prototype._exportHTMLRec = function (aLocalFolderCtr)
{
  var document = Components.classes["@mozilla.org/xml/xml-document;1"].createInstance(Components.interfaces.nsIDOMDocument);
  var dlElt = document.createElement("dl");
  var childrenEnum = aLocalFolderCtr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child  = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;

    let dtElt = document.createElement("dt");
    dtElt.setAttributeNS(this._CLIPPINGS_HTML_NS, "clippings-id", childURI);

    let ddElt = document.createElement("dd");
    
    if (this.isClipping(childURI)) {
      let h3Txt = document.createTextNode(this.getName(childURI));
      let h3Elt = document.createElement("h3");
      h3Elt.appendChild(h3Txt);
      dtElt.appendChild(h3Elt);
      dtElt.className = "clipping";

      let text = this.getText(childURI);
      text = text.replace(/\n/g, "<br>");

      let ddTxt = document.createTextNode(text);
      ddElt.appendChild(ddTxt);

      dlElt.appendChild(dtElt);
      dlElt.appendChild(ddElt);
    }
    else if (this.isFolder(childURI)) {   
      let h2Txt = document.createTextNode(this.getName(childURI));
      let h2Elt = document.createElement("h2");
      h2Elt.appendChild(h2Txt);
      dtElt.appendChild(h2Elt);

      dtElt.className = "folder";
      dlElt.appendChild(dtElt);

      let subfolderCtr = this._getSeqContainerFromFolder(childURI);
      let dlEltInner = this._exportHTMLRec(subfolderCtr);
      let dlEltInnerEx = document.importNode(dlEltInner, true);

      ddElt.appendChild(dlEltInnerEx);
      dlElt.appendChild(ddElt);
    }   
  }

  return dlElt;
};


aeClippingsServiceImpl.prototype._exportLegacyRDFXML = function (aLocalFolderCtr, aExtDataSrc, aExtRootCtr)
{
  var count = 0;
  var childrenEnum = aLocalFolderCtr.GetElements();

  while (childrenEnum.hasMoreElements()) {
    let child = childrenEnum.getNext();
    child = child.QueryInterface(Components.interfaces.nsIRDFResource);
    let childURI = child.Value;

    if (this.isClipping(childURI)) {
      let name = this.getName(childURI);
      let text = this.getText(childURI);
      this._createLegacyClipping(name, text, aExtDataSrc, aExtRootCtr);
    }
    else if (this.isFolder(childURI)) {
      let localSubfolderCtr = this._getSeqContainerFromFolder(childURI);
      count += this._exportLegacyRDFXML(localSubfolderCtr, aExtDataSrc, aExtRootCtr);
    }
    count++;
  }

  return count;
};


aeClippingsServiceImpl.prototype._createLegacyClipping = function (aName, aText, aExtDataSrc, aExtRootCtr)
{
  var subjectNode = this._rdfSvc.GetAnonymousResource();
  var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
  var predText = this._rdfSvc.GetResource(this._PREDTEXT_RESOURCE_URI);
  var targName = this._rdfSvc.GetLiteral(aName);
  var targText = this._rdfSvc.GetLiteral(aText);

  aExtDataSrc.Assert(subjectNode, predName, targName, true);
  aExtDataSrc.Assert(subjectNode, predText, targText, true);

  aExtRootCtr.AppendElement(subjectNode);
};


aeClippingsServiceImpl.prototype.importFromFile = function (aFileURL, aDontNotify, aImportShortcutKeys, /*out*/ aImportRootCtr)
{
  var rv;
  var extDataSrc;
  var extRDFContainer = Components.classes["@mozilla.org/rdf/container;1"]
                                  .createInstance(Components.interfaces
						            .nsIRDFContainer);
  var extSeqNode = this._rdfSvc.GetResource(this._SEQNODE_RESOURCE_URI);
  var extOldSeqNode = this._rdfSvc.GetResource(this._OLD_SEQNODE_RESOURCE_URI);

  try {
    extDataSrc = this._rdfSvc.GetDataSourceBlocking(aFileURL);
  }
  catch (e) {
    this._log(e);
    throw e;
  }

  // Root folder container initialization priority:
  // 1 - New Clippings data source
  // 2 - Clippings 1.x data source
  var isNewDataSrc = false;
  try {
    extRDFContainer.Init(extDataSrc, extSeqNode);
    isNewDataSrc = true;
  }
  catch (e) {
    try {
      extRDFContainer.Init(extDataSrc, extOldSeqNode);
    }
    catch (e) {
      throw Components.Exception("Failed to initialize RDF container!");
    }
  }

  if ((isNewDataSrc && !this._rdfContainerUtils.IsSeq(extDataSrc, extSeqNode))
      || (!isNewDataSrc && !this._rdfContainerUtils.IsSeq(extDataSrc, extOldSeqNode))) {
    throw Components.Exception("Not an RDF Seq container!");
  }

  rv = extRDFContainer.GetCount();
  this._log("External datasource successfully loaded from \"" + aFileURL
	    + "\": " + rv + " item(s) in root folder; format: "
	    + (isNewDataSrc ? "Clippings RDF/XML" : "Clippings 1.x RDF/XML"));

  if (isNewDataSrc) {
    rv = this._importFromFileEx(extRDFContainer, extDataSrc, this._rdfContainer, null, aImportShortcutKeys, true);

    if (! aDontNotify) {
      this._notifyImportDone(rv);
    }

    aImportRootCtr.value = extRDFContainer;
    return rv;
  }

  // Import Clippings 1.x data
  var predName = this._rdfSvc.GetResource(this._PREDNAME_RESOURCE_URI);
  var predText = this._rdfSvc.GetResource(this._PREDTEXT_RESOURCE_URI);
  var targName, targText, newNode;
  var childNodesEnum = extRDFContainer.GetElements();
  var childNode;

  while (childNodesEnum.hasMoreElements()) {
    childNode = childNodesEnum.getNext();
    if (childNode instanceof Components.interfaces.nsIRDFResource) {
      targName = extDataSrc.GetTarget(childNode, predName, true);
      targText = extDataSrc.GetTarget(childNode, predText, true);

      if (targName instanceof Components.interfaces.nsIRDFLiteral
	  && targText instanceof Components.interfaces.nsIRDFLiteral) {
	var name = targName.Value;
	var text = targText.Value;
      }
      else {
	throw Components.Exception("Name and Text nodes are not valid RDF literals!");
      }

      newNode = this._rdfSvc.GetAnonymousResource();
      try {
	this._createNewClippingHelper(this.kRootFolderURI, newNode, name, text, "", this.LABEL_NONE, null, true);
      }
      catch (e) {
	throw Components.Exception("Data source not initialized", Components.results.NS_ERROR_NOT_INITIALIZED);
      }
    }
    else {
      throw Components.Exception("Child node of container is not a valid RDF resource!");
    }
  }

  if (! aDontNotify) {
    this._notifyImportDone(rv);
  }

  aImportRootCtr.value = extRDFContainer;
  return rv;
};


// Import data from Clippings 2.x and newer
aeClippingsServiceImpl.prototype._importFromFileEx = function (aExtFolderCtr, aExtDataSrc, aLocalFolderCtr, aLocalDataSrc, aImportShortcutKeys, aImportSrcURLs)
{
  var count = 0;
  var localFolderURI = aLocalFolderCtr.Resource.Value;
  var extChildrenEnum = aExtFolderCtr.GetElements();

  while (extChildrenEnum.hasMoreElements()) {
    let extChild = extChildrenEnum.getNext();
    extChild = extChild.QueryInterface(Components.interfaces.nsIRDFResource);
    let extChildURI = extChild.Value;
    let name = this.getName(extChildURI, aExtDataSrc);

    if (this.isClipping(extChildURI, aExtDataSrc)) {
      let text = this.getText(extChildURI, aExtDataSrc);
      let label = this.getLabel(extChildURI, aExtDataSrc);

      let srcURL = "";
      if (aImportSrcURLs) {
        srcURL = this.getSourceURL(extChildURI, aExtDataSrc);
      }

      let uri = this.createNewClipping(localFolderURI, name, text, srcURL, label, true, aLocalDataSrc);

      let key;
      if (key = this.getShortcutKey(extChildURI, aExtDataSrc)) {
	if (aImportShortcutKeys) {
	  try {
	    this.setShortcutKey(uri, key, aLocalDataSrc);
	  }
	  catch (e) {
	    // Can't set shortcut key because it is already assigned
	    this._log(e);
	  }
	}
	else {
	  // Shortcut key import will be deferred until importShortcutKeys()
	  // is invoked. For now, store the shortcut keys to be imported into
	  // a temporary array to be used later by importShortcutKeys().
	  this._deferredShortcutKeyImport[key] = uri;
	}
      }

      let clippingDebugMsg = "aeClippingsService._importFromFileEx(): Clipping `" + name + "'";

      if (srcURL) {
        clippingDebugMsg += "; source URL: " + srcURL;
      }
      this._log(clippingDebugMsg);
      
    }
    else if (this.isFolder(extChildURI, aExtDataSrc)) {
      if (extChildURI == this._SYNCED_CLIPPINGS_FOLDER_URI) {
        continue;
      }
      
      let extSubfolderCtr = this._getSeqContainerFromFolder(extChildURI, aExtDataSrc);
      let localSubfolderURI = this.createNewFolder(localFolderURI, name, true, aLocalDataSrc);
      let localSubfolderCtr = this._getSeqContainerFromFolder(localSubfolderURI, aLocalDataSrc);

      this._log("aeClippingsService._importFromFileEx(): Folder `" + name + "'");

      count += this._importFromFileEx(extSubfolderCtr, aExtDataSrc, localSubfolderCtr, aLocalDataSrc, aImportShortcutKeys, aImportSrcURLs);
    }
    else {
      // Neither a clipping nor folder - ignore.  Possibly a new item type that
      // might be introduced in future versions.
    }
    count++;
  }

  return count;
};


aeClippingsServiceImpl.prototype._deferredShortcutKeyImport = {};


aeClippingsServiceImpl.prototype._notifyImportDone = function (aNumItems)
{
  for (let i = 0; i < this._listeners.length; i++) {
    if (this._listeners[i]) {
      this._log("aeClippingsService._notifyImportDone(): Notifying observer " + i);
      this._listeners[i].importDone(aNumItems);
    }
  }
};


aeClippingsServiceImpl.prototype.hasConflictingShortcutKeys = function (aImportRootCtr)
{
  if (aImportRootCtr.Resource.Value == this._OLD_SEQNODE_RESOURCE_URI) {
    throw Components.Exception("Shortcut keys are not supported in Clippings 1.x series");
  }

  var keyMap = this.getShortcutKeyMap();
  return this._hasConflictingShortcutKeys(aImportRootCtr, keyMap);
};


aeClippingsServiceImpl.prototype._hasConflictingShortcutKeys = function (aExtContainer, aShortcutKeyMap)
{
  var extChildrenEnum = aExtContainer.GetElements();
  var extDataSrc = aExtContainer.DataSource;

  while (extChildrenEnum.hasMoreElements()) {
    let extChild = extChildrenEnum.getNext();
    extChild = extChild.QueryInterface(Components.interfaces.nsIRDFResource);
    let extChildURI = extChild.Value;

    if (this.isClipping(extChildURI, extDataSrc)) {
      let pred = this._rdfSvc.GetResource(this._PREDKEY_RESOURCE_URI);
      let targ = extDataSrc.GetTarget(extChild, pred, true);

      if (targ instanceof Components.interfaces.nsIRDFLiteral) {
	let key = targ.Value;
	if (aShortcutKeyMap.has(key)) {
	  return true;
	}
      }
    }
    else if (this.isFolder(extChildURI, extDataSrc)) {
      let extSubfolderCtr = this._getSeqContainerFromFolder(extChildURI, extDataSrc);
      if (this._hasConflictingShortcutKeys(extSubfolderCtr, aShortcutKeyMap)) { 
	return true;
      }
    }
  }

  return false;
};


aeClippingsServiceImpl.prototype.importShortcutKeys = function (aImportRootCtr, aImportFlag)
{
  if (aImportRootCtr.Resource.Value == this._OLD_SEQNODE_RESOURCE_URI) {
    throw Components.Exception("Shortcut keys are not supported in Clippings 1.x series");
  }

  var keyMap = this.getShortcutKeyMap();

  for (let key in this._deferredShortcutKeyImport) {
    // Check for shortcut key conflicts
    if (keyMap.has(key)) {
      if (aImportFlag == this.IMPORT_REPLACE_CURRENT) {
	var currentlyAssignedURI = keyMap.get(key);

	this._log("aeClippingsService.importShortcutKeys(): Overwriting shortcut key assignment for key `" + key + "' (was assigned to clipping `" + currentlyAssignedURI + "')");

	this.setShortcutKey(currentlyAssignedURI, "");

	var newURI = this._deferredShortcutKeyImport[key];
	this.setShortcutKey(newURI, key);

	this._log("aeClippingsService.importShortcutKeys(): Key `" + key + "' is now assigned to clipping `" + newURI + "'");
      }
      else {
	this._log("aeClippingsService.importShortcutKeys(): Key `" + key + "' is already assigned to an existing clipping; skipping");
      }
    }
    else {
      this.setShortcutKey(this._deferredShortcutKeyImport[key], key);
    }
  }

  this.cancelDeferredShortcutKeyImport();
};


aeClippingsServiceImpl.prototype.cancelDeferredShortcutKeyImport = function ()
{
  this._deferredShortcutKeyImport = {};
};


aeClippingsServiceImpl.prototype.importFromJSON = function (aJSONRawData, aReplaceShortcutKeys)
{
  if (! this._rdfContainer) {
    throw Components.Exception("Data source not initialized",
			       Components.results.NS_ERROR_NOT_INITIALIZED);
  }

  let rv = null;
  let jsonData = {};
  
  try {
    jsonData = JSON.parse(aJSONRawData);
  }
  catch (e) {
    throw Components.Exception("Failed to import JSON data: " + e, Components.results.NS_ERROR_FAILURE);
  }

  if (jsonData.userClippingsRoot === undefined) {
    throw Components.Exception("Malformed JSON data", Components.results.NS_ERROR_FAILURE);
  }

  let keyMap = this.getShortcutKeyMap();

  rv = this._importFromJSONHelper(this.kRootFolderURI, jsonData.userClippingsRoot, aReplaceShortcutKeys, keyMap);

  return rv;
};


aeClippingsServiceImpl.prototype._importFromJSONHelper = function (aFolderURI, aImportedItems, aReplaceShortcutKeys, aShortcutKeyMap)
{
  function getClippingURIWithShortcutKey(aShortcutKey) {
    let rv = aShortcutKeyMap.get(aShortcutKey);
    return rv;
  }
  
  let rv = null;
  let count = 0;

  for (let i = 0; i < aImportedItems.length; i++) {
    let item = aImportedItems[i];
    let uri = "";
    
    if ("children" in item) {
      uri = this.createNewFolder(aFolderURI, item.name, true);
      count++;
      count += this._importFromJSONHelper(uri, item.children, aReplaceShortcutKeys, aShortcutKeyMap);
    }
    else {
      let label = ("label" in item ? item.label : "");

      uri = this.createNewClipping(aFolderURI, item.name, item.content, item.sourceURL, label, true);
      count++;

      if (! item.shortcutKey) {
        continue;
      }
      
      if (aShortcutKeyMap.has(item.shortcutKey)) {
        if (aReplaceShortcutKeys) {
	  let clippingURI = getClippingURIWithShortcutKey(item.shortcutKey);

          this._log(`aeClippingsService._importFromJSONHelper(): An imported clipping\'s shortcut key (key = '${item.shortcutKey}') conflicts with an existing clipping (URI: ${clippingURI})`);

          // Unassign the shortcut key on the existing clipping.
          // Then assign the shortcut key to the newly-imported clipping.
          this.setShortcutKey(clippingURI, "");
          this.setShortcutKey(uri, item.shortcutKey);
        }
      }
      else {
        // There is no shortcut key conflict, so go ahead and assign it.
        this.setShortcutKey(uri, item.shortcutKey);
      }
    }
  }
  
  rv = count;
  return rv;
};


//
// Private utility functions
//

aeClippingsServiceImpl.prototype._log = function (aMessage)
{
  if (this._DEBUG) {
    var consoleSvc = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
    consoleSvc.logStringMessage(aMessage);
  }
};


aeClippingsServiceImpl.prototype._strtrm = function (aString)
{
  const SPACE_CODE = 32;

  if (! aString) {
    return aString;
  }

  let len = aString.length;

  if (aString.charCodeAt(0) > SPACE_CODE 
      && aString.charCodeAt(len - 1) > SPACE_CODE) {
	return aString;
      }

  let k = -1;
  while (k < len && aString.charCodeAt(++k) <= SPACE_CODE);
  if (k == len) {
    return "";
  }

  let m = len;
  while (m > 0 && aString.charCodeAt(--m) <= SPACE_CODE);
  return aString.substring(k, m + 1);
};


aeClippingsServiceImpl.prototype._sanitize = function (aString)
{
  // Strips control characters from the string: ASCII codes 0-31 and 127 (DEL),
  // excluding 10 (NL) and 13 (CR) to allow line breaks.
  // Don't exclude tabs (HT, ASCII 9) since they'll be collapsed anyway when
  // the RDF data is saved.
  var rv = aString.replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, " ");
  return rv;
};


aeClippingsServiceImpl.prototype._escapeHTML = function (aString)
{
  let rv = aString.replace(/</g, "&lt;");
  rv = rv.replace(/>/g, "&gt;");
  
  return rv;
};


aeClippingsServiceImpl.prototype._getDateTimeString = function ()
{
  var oDate = new Date();
  var month = oDate.getMonth();
  var date = oDate.getDate();
  var year = oDate.getFullYear();
  var sDate;

  month += 1;
  if (month < 10) month = "0" + month;  
  if (date < 10) date = "0" + date;
  sDate = year.toString() + "-" + month.toString() + "-" + date.toString();

  var hrs = oDate.getHours();  // 24-hr format
  if (hrs < 10) hrs = "0" + hrs;
  var min = oDate.getMinutes();
  if (min < 10) min = "0" + min;
  var sec = oDate.getSeconds();
  if (sec < 10) sec = "0" + sec;
  var sTime = hrs.toString() + min.toString() + sec.toString();

  return (sDate + "_" + sTime);
};


aeClippingsServiceImpl.prototype._getFileFromURL = function (aFileURL)
  // Returns the nsIFile object of the file with the given URL.
{
  var rv;
  var io = Components.classes["@mozilla.org/network/io-service;1"]
                     .getService(Components.interfaces.nsIIOService);
  var fh = io.getProtocolHandler("file")
             .QueryInterface(Components.interfaces.nsIFileProtocolHandler);
  rv = fh.getFileFromURLSpec(aFileURL);
  return rv;
};


aeClippingsServiceImpl.prototype._getURLFromFile = function (aFile)
{
  var rv, file;
  try {
    file = aFile.QueryInterface(Components.interfaces.nsIFile);
  }
  catch (e) {
    throw e;
  }

  var fph = Components.classes["@mozilla.org/network/protocol;1?name=file"].createInstance(Components.interfaces.nsIFileProtocolHandler);
  rv = fph.getURLSpecFromFile(file);

  return rv;
};

