import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'pms-app',
  location: 'asia-northeast3'
};

export const createUserProfileRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateUserProfile', inputVars);
}
createUserProfileRef.operationName = 'CreateUserProfile';

export function createUserProfile(dcOrVars, vars) {
  return executeMutation(createUserProfileRef(dcOrVars, vars));
}

export const getMyNotebooksRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetMyNotebooks');
}
getMyNotebooksRef.operationName = 'GetMyNotebooks';

export function getMyNotebooks(dc) {
  return executeQuery(getMyNotebooksRef(dc));
}

export const createNoteInNotebookRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateNoteInNotebook', inputVars);
}
createNoteInNotebookRef.operationName = 'CreateNoteInNotebook';

export function createNoteInNotebook(dcOrVars, vars) {
  return executeMutation(createNoteInNotebookRef(dcOrVars, vars));
}

export const markTaskCompletedRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'MarkTaskCompleted', inputVars);
}
markTaskCompletedRef.operationName = 'MarkTaskCompleted';

export function markTaskCompleted(dcOrVars, vars) {
  return executeMutation(markTaskCompletedRef(dcOrVars, vars));
}

