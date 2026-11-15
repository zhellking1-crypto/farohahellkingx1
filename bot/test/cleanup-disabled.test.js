"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { findDisabledMemberIDs } = require("../Commands/تنظيف");

test("selects unnamed members and skips bot and admins", () => {
  const info = {
    participantIDs: ["1", "2", "3", "4", "99"],
    adminIDs: [{ id: "2" }],
    userInfo: [
      { id: "1", name: "Ali" },
      { id: "2", name: "" },
      { id: "3", name: "Facebook User" },
      { id: "4", name: "Sara" },
      { id: "99", name: "Bot" },
    ],
  };

  assert.deepEqual(findDisabledMemberIDs(info, "99"), ["3"]);
});

test("treats members missing from userInfo as disabled", () => {
  const info = {
    participantIDs: ["1", "5"],
    adminIDs: [],
    userInfo: { 1: { name: "Ali" } },
  };

  assert.deepEqual(findDisabledMemberIDs(info, "99"), ["5"]);
});

test("refuses to decide when member names are unavailable", () => {
  assert.throws(
    () => findDisabledMemberIDs({ participantIDs: ["1"] }, "99"),
    /تعذر قراءة أسماء أعضاء المجموعة/,
  );
});
