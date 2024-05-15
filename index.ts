import {
  Firestore,
  OrderByDirection,
  WriteBatch,
  deleteDoc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  query,
  writeBatch,
} from "firebase/firestore";
import {
  QueryFieldFilterConstraint,
  QueryOrderByConstraint,
  addDoc,
  collection,
  getDocs,
  orderBy,
  Query,
  where,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { FirebaseApp, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { DocType } from "./types/index.js";

// abstract class to create instance for various collections
export default abstract class FirestoreORM {
  // firebase config object
  static firebaseConfig: object = {};

  // firebase app
  static firebaseApp: FirebaseApp;

  // firestore database instance
  static firestoreDatabase: Firestore;

  // set the collection name
  collection: string;

  // set fillables
  fillables: string[] = [];

  args: any[];

  model_properties: object;

  limitRow: number | null = null;

  docId: string | null = null;

  // define if timestamp is allowed
  timestamp: Boolean = true;

  // define if softDelete is allowed
  softDelete: Boolean = false;

  // define properties of timestamps and softDelete
  created_at: Date;
  updated_at: Date | null = null;
  deleted_at: Date | null = null;

  // where conditions
  whereConditions: QueryFieldFilterConstraint[] = [];

  // orderBy conditions
  orderByConditions: QueryOrderByConstraint[] = [];

  willUpdateAttribues: object = {};

  static #willUpdateAttributesBatchOperations: any[] = [];

  static INCREMENT: number = 1;

  static #batchWrite: boolean = false;
  static #batch: WriteBatch;

  // construct an instance of the collection, not saved
  constructor(...args: any[]) {
    if (!Object.keys(FirestoreORM.firebaseConfig).length)
      throw new Error("Firebase config not setted up!");

    this.args = args;

    // define a creation timestamp for the instance
    this.created_at = new Date();
  }

  fill() {
    let fillables = this.fillables;

    let model_properties = {};

    // match property with the it's value
    [...this.args].forEach((argValue, argPos) => {
      this[fillables[argPos]] = argValue;
      model_properties[fillables[argPos]] = argValue;
    });

    this.model_properties = model_properties;

    //this.#attributes = model_properties;
  }

  static configure(appConfig: object) {
    if (Object.keys(this.firebaseConfig).length) return;

    // assign firebase config
    this.firebaseConfig = appConfig;

    // create firebase app instance
    this.firebaseApp = initializeApp(this.firebaseConfig);

    // save firestore database instance
    this.firestoreDatabase = getFirestore(this.firebaseApp);
  }

  doc(docId: string) {
    this.docId = docId;
    return this;
  }

  async save() {
    // match fillables with attributes;
    this.fill();

    let collectionName = this.collection;

    // add timestamps if allowed
    if (this.timestamp)
      Object.assign(this.model_properties, {
        created_at: this.created_at,
        updated_at: this.updated_at,
        deleted_at: this.deleted_at,
      });

    // add softDelete if allowed
    if (this.softDelete)
      Object.assign(this.model_properties, { deleted_at: this.deleted_at });

    // add document to firestore
    if (FirestoreORM.batchWriteStarted()) {
      FirestoreORM.#willUpdateAttributesBatchOperations.push({
        type: "set",
        collection: collectionName,
        docId: doc(collection(FirestoreORM.firestoreDatabase, collectionName)),
        field: this.model_properties,
      });

      return true;
    } else
      var newDoc = await addDoc(
        collection(FirestoreORM.firestoreDatabase, collectionName),
        this.model_properties
      );

    return newDoc.id.toString();
  }

  where(field: string, operator, values) {
    this.whereConditions = [
      ...this.whereConditions,
      where(field, operator, values),
    ];

    return this;
  }

  orderBy(column: string, order: OrderByDirection = "asc") {
    this.orderByConditions = [
      ...this.orderByConditions,
      orderBy(column, order),
    ];

    return this;
  }

  set(field: string, value: any, operation?: number) {
    let updateTarget = {};

    switch (operation) {
      case 1:
        updateTarget[field] = increment(value);
        Object.assign(this.willUpdateAttribues, updateTarget);

        break;
      default:
        updateTarget[field] = value;
        Object.assign(this.willUpdateAttribues, updateTarget);

        break;
    }

    //paramsToUpdate.forEach((param) => Object.assign(this.willUpdateAttribues, param));
    return this;
  }

  async update() {
    var collectionName = this.collection;

    if (this.docId != null) {
      var docData: DocType = {
        docs: [{ id: this.docId, data: {} }],
        empty: false,
      };
    } else var docData = await this.fetchone();

    if (FirestoreORM.batchWriteStarted()) {
      FirestoreORM.#willUpdateAttributesBatchOperations.push({
        type: "update",
        collection: collectionName,
        docId: docData.docs[0].id,
        field: this.willUpdateAttribues,
      });
    } else {
      const refOfDocument = doc(
        FirestoreORM.firestoreDatabase,
        collectionName,
        docData.docs[0].id
      );
      await updateDoc(refOfDocument, this.willUpdateAttribues);
    }

    this.whereConditions = [];
    this.orderByConditions = [];
    this.willUpdateAttribues = {};
    this.docId = null;

    return true;
  }

  async fetchone() {
    let collectionName = this.collection;

    // array of result;
    let result: DocType = { docs: [], empty: true };

    if (this.docId) {
      let querySnapshot = await getDocFromServer(doc(FirestoreORM.firestoreDatabase, collectionName, this.docId));
      
      if (querySnapshot.exists()) {
        result.docs = [
          {
            id: querySnapshot.id,
            data: querySnapshot.data(),
          },
        ];

        result.empty = false;
      }

    } else {
      // create query from chain conditions
      var q = query(
        collection(FirestoreORM.firestoreDatabase, collectionName),
        ...this.whereConditions,
        ...this.orderByConditions,
        limit(1)
      );

      // run the query
      let querySnapshot = await getDocsFromServer(q);

      if (!querySnapshot.empty) {
        result.docs = [
          {
            id: querySnapshot.docs[0].id,
            data: querySnapshot.docs ? querySnapshot.docs[0].data() : querySnapshot.data(),
          },
        ];
  
        result.empty = false;
      }
    }
    
    this.whereConditions = [];
    this.orderByConditions = [];

    return result;
  }

  async fetch() {
    let collectionName = this.collection;

    const args = [
      collection(FirestoreORM.firestoreDatabase, collectionName),
      ...this.whereConditions,
      ...this.orderByConditions,
      this.limitRow && limit(this.limitRow),
    ];

    if (args[args.length - 1] == undefined) args.pop();

    // create query from chain conditions
    let q = query(...args);

    // array of result;
    let result: DocType = { docs: [], empty: true };

    // run the query
    const querySnapshot = await getDocs(q);

    // loop through querySnapshot and get rows
    querySnapshot.forEach((doc) => {
      // doc.data() is never undefined for query doc snapshots
      result.docs = [...result.docs, { id: doc.id, data: doc.data() }];
    });

    // update empty to false when data is ready
    result.empty = querySnapshot.empty;

    this.whereConditions = [];
    this.orderByConditions = [];
    this.limitRow = null;

    return result;
  }

  limit(limitRow: number) {
    this.limitRow = limitRow;
    return this;
  }

  async deleteDoc() {
    let collectionName = this.collection;

    var d: DocType;

    if (this.docId) {
      await deleteDoc(
        doc(FirestoreORM.firestoreDatabase, collectionName, this.docId)
      );
    } else {
      d = await this.fetch();

      d.docs.forEach(async (docInfo) => {
        await deleteDoc(
          doc(FirestoreORM.firestoreDatabase, collectionName, docInfo.id)
        );
      });
    }

    return true;
  }

  static startBatchWrite() {
    this.#batchWrite = true;
    this.#batch = writeBatch(FirestoreORM.firestoreDatabase);
  }

  static batchWriteStarted() {
    return FirestoreORM.#batchWrite;
  }

  static async commitBatch() {
    FirestoreORM.#willUpdateAttributesBatchOperations.forEach((operation) => {
      switch (operation.type) {
        case "set":
          this.#batch.set(operation.docId, operation.field);
          break;
        case "update":
          this.#batch.update(
            doc(this.firestoreDatabase, operation.collection, operation.docId),
            operation.field
          );
          break;
      }
    });

    this.#batchWrite = false;
    await this.#batch.commit();
  }
}
