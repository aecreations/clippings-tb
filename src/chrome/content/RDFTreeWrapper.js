/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Wrapper object for an RDF <tree> element.  Tree rows can be identified
// either by index or by the URI of its corresponding RDF resource node.
//

function RDFTreeWrapper(aXULTreeElt)
{
  this._tree = aXULTreeElt || null;
}


RDFTreeWrapper.prototype = {
  _rdfSvc:  Components.classes["@mozilla.org/rdf/rdf-service;1"]
                      .getService(Components.interfaces.nsIRDFService),

  get tree()
  {
    return this._tree;
  },

  set tree(aXULTreeElt)
  {
    return (this._tree = aXULTreeElt);
  },

  get selectedIndex()
  {
    return this._tree.currentIndex;
  },

  set selectedIndex(aIndex)
  {
    return (this._tree.view.selection.select(aIndex));
  },

  get selectedURI()
  {
    var rv = "";
    var idx = this._tree.currentIndex;
    if (idx != -1) {
      var res = this._tree.builderView.getResourceAtIndex(idx);
      rv = res.Value;
    }
    return rv;
  },

  set selectedURI(aURI)
  {
    var res = this._rdfSvc.GetResource(aURI);
    var idx = this._tree.builderView.getIndexOfResource(res);
    this._tree.view.selection.select(idx);
  }
};


RDFTreeWrapper.prototype.ensureURIIsVisible = function (aURI)
{
  var res = this._rdfSvc.GetResource(aURI);
  var idx = this._tree.builderView.getIndexOfResource(res);
  this._tree.treeBoxObject.ensureRowIsVisible(idx);
};


RDFTreeWrapper.prototype.ensureIndexIsVisible = function (aIndex)
{
  this._tree.treeBoxObject.ensureRowIsVisible(aIndex);
};


RDFTreeWrapper.prototype.getRowCount = function ()
{
  return this._tree.view.rowCount;
};


RDFTreeWrapper.prototype.getURIAtIndex = function (aIndex)
{
  var rv;
  var res = this._tree.builderView.getResourceAtIndex(aIndex);
  rv = res.Value;
  return rv;
};

RDFTreeWrapper.prototype.getIndexAtURI = function (aURI)
{
  var rv;
  var res = this._rdfSvc.GetResource(aURI);
  rv = this._tree.builderView.getIndexOfResource(res);
  return rv;
};
