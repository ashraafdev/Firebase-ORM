
import FirestoreORM from "./../../index";

export default class TestModel extends FirestoreORM {
  // define softDelete ability
  softDelete = false;

  timestamp = false;

  fillables = [
    "id",
    "firstname",
    "lastname",
  ];

  collection = "test-collection"
}
