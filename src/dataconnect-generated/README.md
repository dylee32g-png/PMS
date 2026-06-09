# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetMyNotebooks*](#getmynotebooks)
- [**Mutations**](#mutations)
  - [*CreateUserProfile*](#createuserprofile)
  - [*CreateNoteInNotebook*](#createnoteinnotebook)
  - [*MarkTaskCompleted*](#marktaskcompleted)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetMyNotebooks
You can execute the `GetMyNotebooks` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getMyNotebooks(): QueryPromise<GetMyNotebooksData, undefined>;

interface GetMyNotebooksRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMyNotebooksData, undefined>;
}
export const getMyNotebooksRef: GetMyNotebooksRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getMyNotebooks(dc: DataConnect): QueryPromise<GetMyNotebooksData, undefined>;

interface GetMyNotebooksRef {
  ...
  (dc: DataConnect): QueryRef<GetMyNotebooksData, undefined>;
}
export const getMyNotebooksRef: GetMyNotebooksRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getMyNotebooksRef:
```typescript
const name = getMyNotebooksRef.operationName;
console.log(name);
```

### Variables
The `GetMyNotebooks` query has no variables.
### Return Type
Recall that executing the `GetMyNotebooks` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetMyNotebooksData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetMyNotebooksData {
  notebooks: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    createdAt: TimestampString;
  } & Notebook_Key)[];
}
```
### Using `GetMyNotebooks`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getMyNotebooks } from '@dataconnect/generated';


// Call the `getMyNotebooks()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getMyNotebooks();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getMyNotebooks(dataConnect);

console.log(data.notebooks);

// Or, you can use the `Promise` API.
getMyNotebooks().then((response) => {
  const data = response.data;
  console.log(data.notebooks);
});
```

### Using `GetMyNotebooks`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getMyNotebooksRef } from '@dataconnect/generated';


// Call the `getMyNotebooksRef()` function to get a reference to the query.
const ref = getMyNotebooksRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getMyNotebooksRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.notebooks);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.notebooks);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateUserProfile
You can execute the `CreateUserProfile` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createUserProfile(vars: CreateUserProfileVariables): MutationPromise<CreateUserProfileData, CreateUserProfileVariables>;

interface CreateUserProfileRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserProfileVariables): MutationRef<CreateUserProfileData, CreateUserProfileVariables>;
}
export const createUserProfileRef: CreateUserProfileRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createUserProfile(dc: DataConnect, vars: CreateUserProfileVariables): MutationPromise<CreateUserProfileData, CreateUserProfileVariables>;

interface CreateUserProfileRef {
  ...
  (dc: DataConnect, vars: CreateUserProfileVariables): MutationRef<CreateUserProfileData, CreateUserProfileVariables>;
}
export const createUserProfileRef: CreateUserProfileRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createUserProfileRef:
```typescript
const name = createUserProfileRef.operationName;
console.log(name);
```

### Variables
The `CreateUserProfile` mutation requires an argument of type `CreateUserProfileVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateUserProfileVariables {
  username: string;
  email?: string | null;
}
```
### Return Type
Recall that executing the `CreateUserProfile` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateUserProfileData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateUserProfileData {
  user_insert: User_Key;
}
```
### Using `CreateUserProfile`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createUserProfile, CreateUserProfileVariables } from '@dataconnect/generated';

// The `CreateUserProfile` mutation requires an argument of type `CreateUserProfileVariables`:
const createUserProfileVars: CreateUserProfileVariables = {
  username: ..., 
  email: ..., // optional
};

// Call the `createUserProfile()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createUserProfile(createUserProfileVars);
// Variables can be defined inline as well.
const { data } = await createUserProfile({ username: ..., email: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createUserProfile(dataConnect, createUserProfileVars);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
createUserProfile(createUserProfileVars).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

### Using `CreateUserProfile`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createUserProfileRef, CreateUserProfileVariables } from '@dataconnect/generated';

// The `CreateUserProfile` mutation requires an argument of type `CreateUserProfileVariables`:
const createUserProfileVars: CreateUserProfileVariables = {
  username: ..., 
  email: ..., // optional
};

// Call the `createUserProfileRef()` function to get a reference to the mutation.
const ref = createUserProfileRef(createUserProfileVars);
// Variables can be defined inline as well.
const ref = createUserProfileRef({ username: ..., email: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createUserProfileRef(dataConnect, createUserProfileVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

## CreateNoteInNotebook
You can execute the `CreateNoteInNotebook` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createNoteInNotebook(vars: CreateNoteInNotebookVariables): MutationPromise<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;

interface CreateNoteInNotebookRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNoteInNotebookVariables): MutationRef<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;
}
export const createNoteInNotebookRef: CreateNoteInNotebookRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createNoteInNotebook(dc: DataConnect, vars: CreateNoteInNotebookVariables): MutationPromise<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;

interface CreateNoteInNotebookRef {
  ...
  (dc: DataConnect, vars: CreateNoteInNotebookVariables): MutationRef<CreateNoteInNotebookData, CreateNoteInNotebookVariables>;
}
export const createNoteInNotebookRef: CreateNoteInNotebookRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createNoteInNotebookRef:
```typescript
const name = createNoteInNotebookRef.operationName;
console.log(name);
```

### Variables
The `CreateNoteInNotebook` mutation requires an argument of type `CreateNoteInNotebookVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateNoteInNotebookVariables {
  notebookId: UUIDString;
  title: string;
  content: string;
  isPinned?: boolean | null;
}
```
### Return Type
Recall that executing the `CreateNoteInNotebook` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateNoteInNotebookData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateNoteInNotebookData {
  note_insert: Note_Key;
}
```
### Using `CreateNoteInNotebook`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createNoteInNotebook, CreateNoteInNotebookVariables } from '@dataconnect/generated';

// The `CreateNoteInNotebook` mutation requires an argument of type `CreateNoteInNotebookVariables`:
const createNoteInNotebookVars: CreateNoteInNotebookVariables = {
  notebookId: ..., 
  title: ..., 
  content: ..., 
  isPinned: ..., // optional
};

// Call the `createNoteInNotebook()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createNoteInNotebook(createNoteInNotebookVars);
// Variables can be defined inline as well.
const { data } = await createNoteInNotebook({ notebookId: ..., title: ..., content: ..., isPinned: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createNoteInNotebook(dataConnect, createNoteInNotebookVars);

console.log(data.note_insert);

// Or, you can use the `Promise` API.
createNoteInNotebook(createNoteInNotebookVars).then((response) => {
  const data = response.data;
  console.log(data.note_insert);
});
```

### Using `CreateNoteInNotebook`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createNoteInNotebookRef, CreateNoteInNotebookVariables } from '@dataconnect/generated';

// The `CreateNoteInNotebook` mutation requires an argument of type `CreateNoteInNotebookVariables`:
const createNoteInNotebookVars: CreateNoteInNotebookVariables = {
  notebookId: ..., 
  title: ..., 
  content: ..., 
  isPinned: ..., // optional
};

// Call the `createNoteInNotebookRef()` function to get a reference to the mutation.
const ref = createNoteInNotebookRef(createNoteInNotebookVars);
// Variables can be defined inline as well.
const ref = createNoteInNotebookRef({ notebookId: ..., title: ..., content: ..., isPinned: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createNoteInNotebookRef(dataConnect, createNoteInNotebookVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.note_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.note_insert);
});
```

## MarkTaskCompleted
You can execute the `MarkTaskCompleted` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
markTaskCompleted(vars: MarkTaskCompletedVariables): MutationPromise<MarkTaskCompletedData, MarkTaskCompletedVariables>;

interface MarkTaskCompletedRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: MarkTaskCompletedVariables): MutationRef<MarkTaskCompletedData, MarkTaskCompletedVariables>;
}
export const markTaskCompletedRef: MarkTaskCompletedRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
markTaskCompleted(dc: DataConnect, vars: MarkTaskCompletedVariables): MutationPromise<MarkTaskCompletedData, MarkTaskCompletedVariables>;

interface MarkTaskCompletedRef {
  ...
  (dc: DataConnect, vars: MarkTaskCompletedVariables): MutationRef<MarkTaskCompletedData, MarkTaskCompletedVariables>;
}
export const markTaskCompletedRef: MarkTaskCompletedRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the markTaskCompletedRef:
```typescript
const name = markTaskCompletedRef.operationName;
console.log(name);
```

### Variables
The `MarkTaskCompleted` mutation requires an argument of type `MarkTaskCompletedVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface MarkTaskCompletedVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `MarkTaskCompleted` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MarkTaskCompletedData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MarkTaskCompletedData {
  task_update?: Task_Key | null;
}
```
### Using `MarkTaskCompleted`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, markTaskCompleted, MarkTaskCompletedVariables } from '@dataconnect/generated';

// The `MarkTaskCompleted` mutation requires an argument of type `MarkTaskCompletedVariables`:
const markTaskCompletedVars: MarkTaskCompletedVariables = {
  id: ..., 
};

// Call the `markTaskCompleted()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await markTaskCompleted(markTaskCompletedVars);
// Variables can be defined inline as well.
const { data } = await markTaskCompleted({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await markTaskCompleted(dataConnect, markTaskCompletedVars);

console.log(data.task_update);

// Or, you can use the `Promise` API.
markTaskCompleted(markTaskCompletedVars).then((response) => {
  const data = response.data;
  console.log(data.task_update);
});
```

### Using `MarkTaskCompleted`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, markTaskCompletedRef, MarkTaskCompletedVariables } from '@dataconnect/generated';

// The `MarkTaskCompleted` mutation requires an argument of type `MarkTaskCompletedVariables`:
const markTaskCompletedVars: MarkTaskCompletedVariables = {
  id: ..., 
};

// Call the `markTaskCompletedRef()` function to get a reference to the mutation.
const ref = markTaskCompletedRef(markTaskCompletedVars);
// Variables can be defined inline as well.
const ref = markTaskCompletedRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = markTaskCompletedRef(dataConnect, markTaskCompletedVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.task_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.task_update);
});
```

