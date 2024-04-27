import { Firestore, OrderByDirection, WriteBatch, getDocsFromServer, query, writeBatch } from "firebase/firestore";
import { QueryFieldFilterConstraint, QueryOrderByConstraint, addDoc, collection, getDocs, orderBy, Query, where, doc, updateDoc, increment } from 'firebase/firestore';
import { FirebaseApp, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// abstract class to create instance for various collections
export default abstract class FirestoreORM {
    // firebase config object
    static firebaseConfig: object = {};

    // firebase app
    static firebaseApp: FirebaseApp

    // firestore database instance
    static firestoreDatabase: Firestore;

    // set the collection name
    static collection: string;

    // set fillables
    static fillables: string[] = [];

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
        if (!Object.keys(FirestoreORM.firebaseConfig).length) throw new Error("Firebase config not setted up!")

        // access to fillables of the child through this.contructor
        let fillables = eval(`${this.constructor.name}.fillables`);
        
        // match property with the it's value
        [...args].forEach((argValue, argPos) => {
            this[fillables[argPos]] = argValue;
        });
        
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

    async save() {
        let collectionName = eval(`${this.constructor.name}.collection`);
        let fillables = eval(`${this.constructor.name}.fillables`);

        const model_properties = {};
    
        // match the model properties with it's appropriate value
        fillables.forEach((propertyName) => {
            model_properties[propertyName] = this[propertyName];
        });

        // add timestamps if allowed
        if (this.timestamp)
            Object.assign(model_properties, {created_at: this.created_at, updated_at: this.updated_at, deleted_at: this.deleted_at});

        // add softDelete if allowed
        if (this.softDelete)
            Object.assign(model_properties, {deleted_at: this.deleted_at});


        // add document to firestore
        if (FirestoreORM.batchWriteStarted()) {
            FirestoreORM.#willUpdateAttributesBatchOperations.push({
                type: "set",
                collection: collectionName,
                docId: doc(collection(FirestoreORM.firestoreDatabase, collectionName)),
                field: model_properties,
            });

            return true;
        } else
            var newDoc = await addDoc(collection(FirestoreORM.firestoreDatabase, collectionName), model_properties);

        return newDoc.id;
    }

    where(field: string, operator, values) {
        this.whereConditions = [
            ...this.whereConditions, where(field, operator, values),
        ];

        return this;
    }

    orderBy(column: string, order: OrderByDirection = 'asc') {
        this.orderByConditions = [
            ...this.orderByConditions, orderBy(column, order),
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
        var collectionName = eval(`${this.constructor.name}.collection`);
        //let fillables = eval(`${this.constructor.name}.fillables`);

        try {
            const docData = await this.fetchone();

            console.log(FirestoreORM.batchWriteStarted());

            if (FirestoreORM.batchWriteStarted()) {
                FirestoreORM.#willUpdateAttributesBatchOperations.push({
                    type: "update",
                    collection: collectionName,
                    docId: docData.id,
                    field: this.willUpdateAttribues,
                });
            } else {
                const refOfDocument = doc(FirestoreORM.firestoreDatabase, collectionName, docData.id);
                await updateDoc(refOfDocument, this.willUpdateAttribues);
            }

            this.whereConditions = [];
            this.orderByConditions = [];
            this.willUpdateAttribues = {};

            return true;
        } catch (err) {
            throw new Error(err.message);
        }
    }

    async fetchone() {
        let collectionName = eval(`${this.constructor.name}.collection`);

        try {
            // create query from chain conditions
            let q = query(collection(FirestoreORM.firestoreDatabase, collectionName), ...this.whereConditions, ...this.orderByConditions);

            // run the query
            const querySnapshot = await getDocsFromServer(q);
            
            this.whereConditions = [];
            this.orderByConditions = [];
           
            // get first element
            if (!querySnapshot.empty) return {id: querySnapshot.docs[0].id, data: querySnapshot.docs[0].data(), empty: false};
    
            return {id: null, data: null, empty: true};
        } catch (err) {
            throw new Error(err.message);
        }
    }

    async fectchall() {
        let collectionName = eval(`${this.constructor.name}.collection`);

        try {
            // create query from chain conditions
            let q = query(collection(FirestoreORM.firestoreDatabase, collectionName), ...this.whereConditions, ...this.orderByConditions);

            // array of result;
            let result: object[] = [];

            // run the query
            const querySnapshot = await getDocs(q);
           
            // loop through querySnapshot and get rows 
            querySnapshot.forEach((doc) => {
                // doc.data() is never undefined for query doc snapshots
                result = [...result, {id: doc.id, data: doc.data()}];
            });

            this.whereConditions = [];
            this.orderByConditions = [];

            return result;
        } catch (err) {
            throw new Error(err.message);
        }
    }

    static startBatchWrite() {
        this.#batchWrite = true;
        this.#batch = writeBatch(FirestoreORM.firestoreDatabase);
    }

    static batchWriteStarted() {
        return FirestoreORM.#batchWrite;
    }

    static async commitBatch() {
        FirestoreORM.#willUpdateAttributesBatchOperations.forEach(operation => {

            switch (operation.type) {
                case "set":
                    this.#batch.set(operation.docId, operation.field);
                    break;
                case "update":
                    this.#batch.update(doc(
                        this.firestoreDatabase, operation.collection, operation.docId,
                    ), operation.field);
                    break;
            }

        });

        this.#batchWrite = false;
        await this.#batch.commit();
    }
}