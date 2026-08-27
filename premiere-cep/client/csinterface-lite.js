'use strict';

function CSInterface() {}

CSInterface.prototype.evalScript = function evalScript(script, callback) {
  window.__adobe_cep__.evalScript(script, callback || function noop() {});
};

CSInterface.prototype.getSystemPath = function getSystemPath(pathType) {
  return window.__adobe_cep__.getSystemPath(pathType);
};

CSInterface.prototype.getOSInformation = function getOSInformation() {
  return window.__adobe_cep__.getOSInformation();
};

CSInterface.prototype.closeExtension = function closeExtension() {
  window.__adobe_cep__.closeExtension();
};

var SystemPath = { EXTENSION: 'extension', USER_DATA: 'userData', MY_DOCUMENTS: 'myDocuments' };
