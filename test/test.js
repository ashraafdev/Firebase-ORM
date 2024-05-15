import "./config/database.js";
import TestModel from "./models/TestModel.js";

var theDocId = null;

test("getting all doc", async () => {
  const data = await new TestModel().fetch();

  expect(data).toEqual({
    empty: false,
    docs: [
      {
        id: "ayQCwL3zVs480Xx05oZi",
        data: { id: "1", firstname: "test", lastname: "test" },
      },
      {
        id: "wZPBq0wyBffbdHxxr8Je",
        data: { id: "2", firstname: "test2", lastname: "test2" },
      },
    ],
  });
});


test("getting 1 doc", async () => {
    const data = await new TestModel().fetchone();

    expect(data).toEqual({
        empty: false,
        docs: [
          {
            id: "ayQCwL3zVs480Xx05oZi",
            data: { id: "1", firstname: "test", lastname: "test" },
          },
        ],
      });
})

test("getting doc with simple where condition", async () => {
    const data = await new TestModel().where('id', '==', '1').fetch();

    expect(data).toEqual({
        empty: false,
        docs: [
          {
            id: "ayQCwL3zVs480Xx05oZi",
            data: { id: "1", firstname: "test", lastname: "test" },
          },
        ],
      });
})

test("getting doc with multiple where conditions", async () => {
    const data = await new TestModel().where('id', '==', '1').where('firstname', '==', 'test').fetch();

    expect(data).toEqual({
        empty: false,
        docs: [
          {
            id: "ayQCwL3zVs480Xx05oZi",
            data: { id: "1", firstname: "test", lastname: "test" },
          },
        ],
      });
})

test("getting doc with multiple where conditions, false info", async () => {
    const data = await new TestModel().where('id', '==', '1').where('firstname', '==', 'test1').fetch();

    expect(data).toEqual({
        empty: true,
        docs: [],
      });
})


test("add new doc", async () => {
    const docId = await new TestModel('3', 'Test3', 'Test3').save();
    expect(typeof docId).toEqual('string');
});

test("update a doc", async () => {
  const result = await new TestModel().where('id', '==', '3').set('id', "4").update();
  expect(result).toEqual(true);
});

test("delete a doc", async () => {
  const result = await new TestModel().where('id', '==', '4').deleteDoc();
  expect(result).toEqual(true);
});

test("add a new second doc", async () => {
  const docId = await new TestModel('4', 'Test4', 'Test4').save();
  theDocId = docId;
  expect(typeof docId).toEqual('string');
});

test("update the new second doc with doc functionality", async () => {
  const result = await new TestModel().doc(theDocId).set('firstname', 'achraf').update();
  expect(result).toEqual(true);
});

test("delete the second doc with doc functionality", async () => {
  const result = await new TestModel().doc(theDocId).deleteDoc();
  expect(result).toEqual(true);
});

test("get data with a limit of 1", async () => {
  const data = await new TestModel().limit(1).fetch();
  expect(data).toEqual({
    empty: false,
    docs: [
      {
        id: "ayQCwL3zVs480Xx05oZi",
        data: { id: "1", firstname: "test", lastname: "test" },
      },
    ],
  });
});

test("get data with a limit of 2", async () => {
  const data = await new TestModel().limit(2).fetch();

  expect(data).toEqual({
    empty: false,
    docs: [
      {
        id: "ayQCwL3zVs480Xx05oZi",
        data: { id: "1", firstname: "test", lastname: "test" },
      },
      {
        id: "wZPBq0wyBffbdHxxr8Je",
        data: { id: "2", firstname: "test2", lastname: "test2" },
      },
    ],
  });
});

/*test("getting doc with limit", async () => {
    const data = await new TestModel().where('id', '==', '1').limit()
})*/