import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateNoteInNotebookData {
  note_insert: Note_Key;
}

export interface CreateNoteInNotebookVariables {
  notebookId: UUIDString;
  title: string;
  content: string;
  isPinned?: boolean | null;
}

export interface CreateUserProfileData {
  user_insert: User_Key;
}

export interface CreateUserProfileVariables {
  username: string;
  email?: string | null;
}

export interface GetMyNotebooksData {
  notebooks: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    createdAt: TimestampString;
  } & Notebook_Key)[];
}

export interface MarkTaskCompletedData {
  task_update?: Task_Key | null;
}

export interface MarkTaskCompletedVariables {
  id: UUIDString;
}

export interface Note_Key {
  id: UUIDString;
  __typename?: 'Note_Key';
}

export interface Notebook_Key {
  id: UUIDString;
  __typename?: 'Notebook_Key';
}

export interface Task_Key {
  id: UUIDString;
  __typename?: 'Task_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateUserProfileRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserProfileVariables): MutationRef<CreateUserProfileData, CreateUserProfileVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateUserProfileVariables): MutationRef<CreateUserProfileData, CreateUserProfileVariables>;
  operationName: string;
}
export const createUserProfileRef: CreateUserProfileRef;

export function createUserProfile(vars: CreateUserProfileVariables): MutationPromise<CreateUserProfileData, CreateUserProfileVariables>;
export function createUserProfile(dc: DataConnect, vars: CreateUserProfileVariables): MutationPromise<CreateUserProfileData, CreateUserProfileVariables>;

interface GetMyNotebooksRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMyNotebooksData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetMyNotebooksData, undefined>;
  operationName: string;
}
export const getMyNotebooksRef: GetMyNotebooksRef;

export function getMyNotebooks(): QueryPromise<GetMyNotebooksData, undefined>;
export function getMyNotebooks(dc: DataConnect): QueryPromise<GetMyNotebooksData, undefined>;

interface CreateNoteInNotebookRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNoteInNotebookVariables): MutationRef<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateNoteInNotebookVariables): MutationRef<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;
  operationName: string;
}
export const createNoteInNotebookRef: CreateNoteInNotebookRef;

export function createNoteInNotebook(vars: CreateNoteInNotebookVariables): MutationPromise<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;
export function createNoteInNotebook(dc: DataConnect, vars: CreateNoteInNotebookVariables): MutationPromise<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;

interface MarkTaskCompletedRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: MarkTaskCompletedVariables): MutationRef<MarkTaskCompletedData, MarkTaskCompletedVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: MarkTaskCompletedVariables): MutationRef<MarkTaskCompletedData, MarkTaskCompletedVariables>;
  operationName: string;
}
export const markTaskCompletedRef: MarkTaskCompletedRef;

export function markTaskCompleted(vars: MarkTaskCompletedVariables): MutationPromise<MarkTaskCompletedData, MarkTaskCompletedVariables>;
export function markTaskCompleted(dc: DataConnect, vars: MarkTaskCompletedVariables): MutationPromise<MarkTaskCompletedData, MarkTaskCompletedVariables>;

