const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'pms-app',
  location: 'asia-northeast3'
};
exports.connectorConfig = connectorConfig;

const createUserProfileRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateUserProfile', inputVars);
}
createUserProfileRef.operationName = 'CreateUserProfile';
exports.createUserProfileRef = createUserProfileRef;

exports.createUserProfile = function createUserProfile(dcOrVars, vars) {
  return executeMutation(createUserProfileRef(dcOrVars, vars));
};

const getMyNotebooksRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetMyNotebooks');
}
getMyNotebooksRef.operationName = 'GetMyNotebooks';
exports.getMyNotebooksRef = getMyNotebooksRef;

exports.getMyNotebooks = function getMyNotebooks(dc) {
  return executeQuery(getMyNotebooksRef(dc));
};

const createNoteInNotebookRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateNoteInNotebook', inputVars);
}
createNoteInNotebookRef.operationName = 'CreateNoteInNotebook';
exports.createNoteInNotebookRef = createNoteInNotebookRef;

exports.createNoteInNotebook = function createNoteInNotebook(dcOrVars, vars) {
  return executeMutation(createNoteInNotebookRef(dcOrVars, vars));
};

const markTaskCompletedRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'MarkTaskCompleted', inputVars);
}
markTaskCompletedRef.operationName = 'MarkTaskCompleted';
exports.markTaskCompletedRef = markTaskCompletedRef;

exports.markTaskCompleted = function markTaskCompleted(dcOrVars, vars) {
  return executeMutation(markTaskCompletedRef(dcOrVars, vars));
};
