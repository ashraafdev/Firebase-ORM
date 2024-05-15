import {
  Firestore, OrderByDirection, deleteDoc, deleteField, getDocFromServer, getDocsFromServer, limit, query,
} from "firebase/firestore";

import {
  QueryFieldFilterConstraint, QueryOrderByConstraint, addDoc, collection, getDocs, orderBy, where, doc, updateDoc, increment,
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

  static INCREMENT: number = 1;
  static DELETE_FIELD: number = 2;

  // construct an instance of the collection, not saved
  constructor(...args: any[]) {
    if (!Object.keys(FirestoreORM.firebaseConfig).length)
      throw new Error("Firebase config not setted up!");

    this.args = args;

    // define a creation timestamp for the instance
    this.created_at = new Date();
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

  fill() {
    let fillables = this.fillables;

    let model_properties = {};

    // match property with the it's value
    [...this.args].forEach((argValue, argPos) => {
      this[fillables[argPos]] = argValue;
      model_properties[fillables[argPos]] = argValue;
    });

    this.model_properties = model_properties;
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

  set(field: string, value: any, operation?: number) {
    let updateTarget = {};

    switch (operation) {
      case 1:
        updateTarget[field] = increment(value);
        Object.assign(this.willUpdateAttribues, updateTarget);

        break;
      case 2:
        updateTarget[field] = deleteField();
        Object.assign(this.willUpdateAttribues, updateTarget);

        break;
      default:
        updateTarget[field] = value;
        Object.assign(this.willUpdateAttribues, updateTarget);

        break;
    }

    return this;
  }

  orderBy(column: string, order: OrderByDirection = "asc") {
    this.orderByConditions = [
      ...this.orderByConditions,
      orderBy(column, order),
    ];

    return this;
  }


  limit(limitRow: number) {
    this.limitRow = limitRow;
    return this;
  }

  async fetchone() {
    let collectionName = this.collection;

    // array of result;
    let result: DocType = { docs: [], empty: true };

    if (this.docId) {
      let querySnapshot = await getDocFromServer(
        doc(FirestoreORM.firestoreDatabase, collectionName, this.docId)
      );

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
            data: querySnapshot.docs[0].data(),
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

  async update() {
    var collectionName = this.collection;

    if (this.docId != null) {
      var docData: DocType = {
        docs: [{ id: this.docId, data: {} }],
        empty: false,
      };
    } else var docData = await this.fetchone();

    const refOfDocument = doc(
      FirestoreORM.firestoreDatabase,
      collectionName,
      docData.docs[0].id
    );

    await updateDoc(refOfDocument, this.willUpdateAttribues);

    this.whereConditions = [];
    this.orderByConditions = [];
    this.willUpdateAttribues = {};
    this.docId = null;

    return true;
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
}
