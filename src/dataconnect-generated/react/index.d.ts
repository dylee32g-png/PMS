import { CreateUserProfileData, CreateUserProfileVariables, GetMyNotebooksData, CreateNoteInNotebookData, CreateNoteInNotebookVariables, MarkTaskCompletedData, MarkTaskCompletedVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateUserProfile(options?: useDataConnectMutationOptions<CreateUserProfileData, FirebaseError, CreateUserProfileVariables>): UseDataConnectMutationResult<CreateUserProfileData, CreateUserProfileVariables>;
export function useCreateUserProfile(dc: DataConnect, options?: useDataConnectMutationOptions<CreateUserProfileData, FirebaseError, CreateUserProfileVariables>): UseDataConnectMutationResult<CreateUserProfileData, CreateUserProfileVariables>;

export function useGetMyNotebooks(options?: useDataConnectQueryOptions<GetMyNotebooksData>): UseDataConnectQueryResult<GetMyNotebooksData, undefined>;
export function useGetMyNotebooks(dc: DataConnect, options?: useDataConnectQueryOptions<GetMyNotebooksData>): UseDataConnectQueryResult<GetMyNotebooksData, undefined>;

export function useCreateNoteInNotebook(options?: useDataConnectMutationOptions<CreateNoteInNotebookData, FirebaseError, CreateNoteInNotebookVariables>): UseDataConnectMutationResult<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;
export function useCreateNoteInNotebook(dc: DataConnect, options?: useDataConnectMutationOptions<CreateNoteInNotebookData, FirebaseError, CreateNoteInNotebookVariables>): UseDataConnectMutationResult<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;

export function useMarkTaskCompleted(options?: useDataConnectMutationOptions<MarkTaskCompletedData, FirebaseError, MarkTaskCompletedVariables>): UseDataConnectMutationResult<MarkTaskCompletedData, MarkTaskCompletedVariables>;
export function useMarkTaskCompleted(dc: DataConnect, options?: useDataConnectMutationOptions<MarkTaskCompletedData, FirebaseError, MarkTaskCompletedVariables>): UseDataConnectMutationResult<MarkTaskCompletedData, MarkTaskCompletedVariables>;
