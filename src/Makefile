# Makefile

EXT_VER=`./getver.pl`
DIST_FILE=clippings-tb-$(EXT_VER).xpi
CHROME = ./chrome
COMPONENTS = ./components
COMP_FILES = $(COMPONENTS)/aeIClippingsService.xpt                            \
$(COMPONENTS)/aeClippingsService.js                                           \
$(COMPONENTS)/aeIDictionary.xpt $(COMPONENTS)/aeDictionary.js
MODULES = ./modules
MODULE_FILES = $(MODULES)/*.js
DEFAULTS_PREFS = ./defaults/preferences
EXCLUDE = \*~ \*.psp \*.bak


$(DIST_FILE): $(CHROME)/clippings.jar install.rdf manifest.json $(DEFAULTS_PREFS)/prefs.js $(COMP_FILES)
	[ ! -f chrome.manifest.devel ] && mv -v chrome.manifest chrome.manifest.devel && cp -v chrome.manifest.release chrome.manifest
	zip $(DIST_FILE) $(CHROME)/clippings.jar install.rdf manifest.json chrome.manifest \
$(DEFAULTS_PREFS)/prefs.js $(COMP_FILES) $(MODULE_FILES)

$(CHROME)/clippings.jar: 
	cd $(CHROME); zip -r clippings.jar * -x $(EXCLUDE); zip -d clippings.jar content/strfmt.js content/strtrm.js

$(COMP_FILES):
	@cd $(COMPONENTS); make

clean:
	rm -fv ./$(DIST_FILE) $(CHROME)/clippings.jar
	[ -f chrome.manifest.devel ] && rm -v chrome.manifest && mv -v chrome.manifest.devel chrome.manifest

clean-all:
	rm -fv ./$(DIST_FILE) $(CHROME)/clippings.jar
	@cd $(COMPONENTS); make clean
	[ -f chrome.manifest.devel ] && rm -v chrome.manifest && mv -v chrome.manifest.devel chrome.manifest

# End of Makefile
